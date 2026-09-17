import express from "express";
import { createRequire } from "node:module";
import { timingSafeEqual } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT) || 8080;
const APP_VERSION = process.env.APP_VERSION || "dev";
const EDIT_PASSCODE = process.env.EDIT_PASSCODE || "";
const STORE_DIR = process.env.STORE_DIR || path.join(__dirname, "store");
const OVERRIDES_FILE = path.join(STORE_DIR, "overrides.json");

if (!EDIT_PASSCODE) {
  console.warn("[warn] EDIT_PASSCODE is not set — editing is disabled until it is.");
}

// ---- base data (read once; restart the container to pick up changes) ----
const base = require("./data/schedule.json");
const leader = require("./data/leader.json");
const schedule = {
  ...base,
  people: [...leader.people, ...base.people],
  events: [...leader.events, ...base.events],
};

// ---- overrides store: tiny JSON file, written atomically ----
let overrides = {};
let writeChain = Promise.resolve();

async function loadOverrides() {
  try {
    overrides = JSON.parse(await fs.readFile(OVERRIDES_FILE, "utf8"));
  } catch (err) {
    if (err.code !== "ENOENT") console.error("[overrides] failed to read:", err.message);
    overrides = {};
  }
}

function saveOverrides() {
  // Serialize writes so concurrent PUTs never interleave.
  writeChain = writeChain.then(async () => {
    await fs.mkdir(STORE_DIR, { recursive: true });
    const tmp = `${OVERRIDES_FILE}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(overrides, null, 2));
    await fs.rename(tmp, OVERRIDES_FILE);
  });
  return writeChain;
}

// index.html and sw.js are stamped with the build version once at startup.
const indexHtml = (await fs.readFile(path.join(__dirname, "public", "index.html"), "utf8")).replaceAll("__V__", APP_VERSION);
const swJs = (await fs.readFile(path.join(__dirname, "public", "sw.js"), "utf8")).replace("__SW_VERSION__", APP_VERSION);

// ---- helpers ----
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const eventIds = new Set(schedule.events.map((e) => e.id));

function passcodeOk(candidate) {
  if (!EDIT_PASSCODE || typeof candidate !== "string") return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(EDIT_PASSCODE);
  return a.length === b.length && timingSafeEqual(a, b);
}

function requirePasscode(req, res, next) {
  if (!EDIT_PASSCODE) return res.status(503).json({ error: "Editing is disabled on this server." });
  if (!passcodeOk(req.get("x-passcode"))) return res.status(401).json({ error: "Wrong passcode." });
  next();
}

// ---- app ----
const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "10kb" }));

// Keep the whole site out of search engines, whatever the path.
app.use((req, res, next) => {
  res.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  next();
});

app.get("/api/schedule", (req, res) => {
  res.set("Cache-Control", "no-cache");
  res.json(schedule);
});

app.get("/api/overrides", (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json(overrides);
});

app.post("/api/unlock", (req, res) => {
  if (!EDIT_PASSCODE) return res.status(503).json({ error: "Editing is disabled on this server." });
  if (!passcodeOk(req.body?.passcode)) return res.status(401).json({ error: "Wrong passcode." });
  res.status(204).end();
});

app.put("/api/overrides/:eventId", requirePasscode, async (req, res) => {
  const { eventId } = req.params;
  if (!eventIds.has(eventId)) return res.status(404).json({ error: "Unknown event." });
  const { start, end } = req.body ?? {};
  if (!TIME_RE.test(start) || !TIME_RE.test(end)) {
    return res.status(400).json({ error: "start and end must be HH:MM." });
  }
  if (end < start) return res.status(400).json({ error: "end must not be before start." });
  overrides[eventId] = { start, end, updatedAt: new Date().toISOString() };
  await saveOverrides();
  res.json(overrides[eventId]);
});

app.delete("/api/overrides/:eventId", requirePasscode, async (req, res) => {
  delete overrides[req.params.eventId];
  await saveOverrides();
  res.status(204).end();
});

const PUBLIC = path.join(__dirname, "public");

// Build-versioned assets: the path changes every deploy, so they can be cached forever.
app.use(
  `/_v/${APP_VERSION}`,
  express.static(PUBLIC, { index: false, immutable: true, maxAge: "1y" })
);
// A stale page asking for an older build's assets gets the current ones (its next load fixes itself).
app.use("/_v/:version", (req, res, next) => {
  req.url = req.url.replace(/^\/_v\/[^/]+/, "");
  express.static(PUBLIC, { index: false, cacheControl: false, setHeaders: (r) => r.set("Cache-Control", "no-cache") })(req, res, next);
});

// Root files (page, service worker, manifest, icons): always revalidated.
app.get(["/", "/index.html"], (req, res) => {
  res.set("Cache-Control", "no-cache");
  res.type("html").send(indexHtml);
});
app.get("/sw.js", (req, res) => {
  res.set({ "Cache-Control": "no-cache", "Service-Worker-Allowed": "/" });
  res.type("application/javascript").send(swJs);
});
app.use(
  express.static(PUBLIC, {
    index: false,
    setHeaders(res, filePath) {
      if (filePath.endsWith(".html") || filePath.endsWith(".js") || filePath.endsWith(".css")) {
        res.set("Cache-Control", "no-cache");
      }
      if (filePath.endsWith("sw.js")) res.set("Service-Worker-Allowed", "/");
    },
  })
);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Server error." });
});

await loadOverrides();
app.listen(PORT, () => {
  console.log(`mahmoud-schedule listening on :${PORT} (overrides at ${OVERRIDES_FILE})`);
});
