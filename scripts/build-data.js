// Builds data/schedule.json and data/leader.json from the human-editable files in data/src/.
// Run: node scripts/build-data.js
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, "..", "data", "src");
const OUT = path.join(__dirname, "..", "data");

const meta = JSON.parse(readFileSync(path.join(SRC, "meta.json"), "utf8"));
const LINE_RE = /^(\d{2}:\d{2})-(\d{2}:\d{2})\s+(.+?)\s*$/;

// Order matters: first match wins.
const KIND_RULES = [
  ["allocated-lunch", /allocated lunch/i],
  ["lunch", /\blunch\b/i],
  ["finish", /competitor finish|^finish$|^end of|competition ends|^end$/i],
  ["break", /\bbreak\b/i],
  ["leave", /\bleav(e|ing)\b|out of competition site|competitors leave/i],
  ["arrival", /\barriv|reception|enter (the )?(shop|workshop|competition|briefing)|may enter/i],
  ["briefing", /open comm|briefing|\bbrief\b|^cc\b|compatriot communication|expert\/competitor|expert and competitor|reading and q&a|overview:/i],
  // Admin-ish items that would otherwise match the broad "work" rule.
  ["other", /\bmarking\b|walk to|agreement|\bsign|tidy|welcome|timetable/i],
  ["work", /competitors begin/i],
  [
    "work",
    /competition|module|\bwork\b|test project|rotation|familiari[sz]|zone|phase|round|challang|challenge|design|building|robot|prototyp|m&m|hwd|esp\b|programming|evaluation|assessment|flying|presentation on stage|preparation for|hands-on|practice/i,
  ],
];

function classify(title) {
  for (const [kind, re] of KIND_RULES) if (re.test(title)) return kind;
  return "other";
}

function parseBlockLines(lines, ctx) {
  const events = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = LINE_RE.exec(line);
    if (!m) throw new Error(`${ctx}: cannot parse line "${line}"`);
    const [, start, end, title] = m;
    if (end < start) throw new Error(`${ctx}: end before start in "${line}"`);
    events.push({ start, end, title });
  }
  return events;
}

function dedupe(events) {
  const seen = new Set();
  return events.filter((e) => {
    const key = `${e.day}|${e.person}|${e.start}|${e.end}|${e.title.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function finalize(events, prefix) {
  const counters = new Map();
  return events.map((e) => {
    const key = `${e.day}-${e.person}`;
    const n = (counters.get(key) ?? 0) + 1;
    counters.set(key, n);
    return {
      id: `${e.day}-${e.person}-${String(n).padStart(2, "0")}`,
      day: e.day,
      person: e.person,
      start: e.start,
      end: e.end,
      title: e.title,
      kind: classify(e.title),
    };
  });
}

// ---- competitors: one file per day, "@person" blocks ----
const dayIds = new Set(meta.days.map((d) => d.id));
const personIds = new Set(meta.people.map((p) => p.id));
let competitorEvents = [];

for (const day of meta.days) {
  const file = path.join(SRC, `${day.id}.txt`);
  const text = readFileSync(file, "utf8");
  let person = null;
  let buffer = [];
  const flush = () => {
    if (!person) return;
    for (const ev of parseBlockLines(buffer, `${day.id}.txt @${person}`)) {
      competitorEvents.push({ ...ev, day: day.id, person });
    }
    buffer = [];
  };
  for (const line of text.split("\n")) {
    if (line.startsWith("@")) {
      flush();
      person = line.slice(1).trim();
      if (!personIds.has(person)) throw new Error(`${day.id}.txt: unknown person "${person}"`);
    } else if (person) {
      buffer.push(line);
    }
  }
  flush();
}
competitorEvents = finalize(dedupe(competitorEvents));

// Which person/day combos have no usable timetable (nothing, or only the allocated lunch)?
const noTimetable = [];
for (const day of meta.days) {
  for (const p of meta.people) {
    const evs = competitorEvents.filter((e) => e.day === day.id && e.person === p.id);
    if (evs.every((e) => e.kind === "allocated-lunch")) noTimetable.push({ day: day.id, person: p.id });
  }
}

const schedule = {
  event: meta.event,
  days: meta.days,
  people: meta.people.map((p) => ({ ...p, role: "competitor" })),
  events: competitorEvents,
  noTimetable,
  generatedAt: new Date().toISOString(),
};
writeFileSync(path.join(OUT, "schedule.json"), JSON.stringify(schedule, null, 2) + "\n");

// ---- leader: single file, "[DAY]" blocks ----
const leaderText = readFileSync(path.join(SRC, "leader.txt"), "utf8");
let leaderEvents = [];
{
  let day = null;
  let buffer = [];
  const flush = () => {
    if (!day) return;
    for (const ev of parseBlockLines(buffer, `leader.txt [${day}]`)) {
      leaderEvents.push({ ...ev, day, person: "mahmoud" });
    }
    buffer = [];
  };
  for (const line of leaderText.split("\n")) {
    const m = /^\[([^\]]+)\]\s*$/.exec(line.trim());
    if (m) {
      flush();
      day = m[1];
      if (!dayIds.has(day)) throw new Error(`leader.txt: unknown day "${day}"`);
    } else if (day) {
      buffer.push(line);
    }
  }
  flush();
}
const leader = {
  people: [{ id: "mahmoud", name: "Mahmoud", skill: "Team Leader", role: "leader" }],
  events: finalize(dedupe(leaderEvents)),
};
writeFileSync(path.join(OUT, "leader.json"), JSON.stringify(leader, null, 2) + "\n");

// ---- summary ----
const byKind = {};
for (const e of competitorEvents) byKind[e.kind] = (byKind[e.kind] ?? 0) + 1;
console.log(`schedule.json: ${competitorEvents.length} events, ${meta.people.length} people, ${meta.days.length} days`);
console.log("kinds:", byKind);
console.log("no timetable:", noTimetable.map((n) => `${n.day}/${n.person}`).join(", "));
console.log(`leader.json: ${leader.events.length} events`);
