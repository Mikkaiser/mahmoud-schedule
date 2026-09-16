import { now, fmt, isSimulated, weekday, dayMonth } from "./lib/time.js";
import { resolveEvents } from "./lib/model.js";
import { renderBoard, getDensity, setDensity } from "./views/board.js";
import { renderNow } from "./views/now.js";
import { renderPerson } from "./views/person.js";
import { openSheet, closeSheet } from "./views/sheet.js";
import { api } from "./lib/api.js";

const $ = (id) => document.getElementById(id);
const POLL_MS = 60_000;
const VIEWS = ["board", "now", "person"];

export const state = {
  schedule: null,   // { event, days, people, events, noTimetable }
  overrides: {},
  events: [],       // resolved
  day: null,
  view: "board",
  person: null,
  editing: false,
  offlineSince: null,
  lastFetch: null,
};

// ---------- persistence helpers ----------
const cache = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};

// ---------- routing ----------
function parseHash() {
  const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  return { day: parts[0] || null, view: parts[1] || null, person: parts[2] || null };
}
export function navigate({ day = state.day, view = state.view, person = state.person } = {}) {
  const parts = [day, view];
  if (view === "person" && person) parts.push(person);
  const h = "#/" + parts.join("/");
  if (location.hash !== h) location.hash = h;
  else applyRoute();
}
function applyRoute() {
  const r = parseHash();
  const days = state.schedule.days;
  const today = days.find((d) => d.date === now().date);
  state.day = days.some((d) => d.id === r.day) ? r.day : (today ?? nearestDay(days)).id;
  state.view = VIEWS.includes(r.view) ? r.view : "board";
  state.person = r.person && state.schedule.people.some((p) => p.id === r.person) ? r.person : state.person;
  if (state.view === "person" && !state.person) state.person = state.schedule.people[0].id;
  render();
}
function nearestDay(days) {
  const today = now().date;
  return days.find((d) => d.date >= today) ?? days[days.length - 1];
}

// ---------- rendering ----------
function renderChrome() {
  const { days, people } = state.schedule;
  const today = now().date;
  $("days").innerHTML = days
    .map(
      (d) =>
        `<a href="#/${d.id}/${state.view}${state.view === "person" && state.person ? "/" + state.person : ""}"
            ${d.id === state.day ? 'aria-current="page"' : ""} class="${d.date === today ? "today" : ""}"
            title="${d.subtitle}">
           ${d.label}<small>${weekday(d.date)} ${dayMonth(d.date)}</small>
         </a>`
    )
    .join("");
  for (const a of $("views").querySelectorAll("a")) {
    const v = a.dataset.view;
    a.href = `#/${state.day}/${v}${v === "person" && state.person ? "/" + state.person : ""}`;
    a.toggleAttribute("aria-current", v === state.view);
    if (v === state.view) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  }
  const dens = $("density");
  dens.hidden = state.view !== "board";
  dens.textContent = getDensity() === "compact" ? "Show details" : "Compact";
  const lock = $("lock");
  lock.setAttribute("aria-pressed", String(state.editing));
  $("lock-label").textContent = state.editing ? "Editing on" : "Unlock editing";
  lock.title = state.editing ? "Tap to lock editing" : "Enter passcode to shift times";
}

export function render() {
  renderChrome();
  const main = $("main");
  const prevBoard = main.querySelector(".board");
  const ctx = {
    state,
    navigate,
    onEvent: (ev) => openSheet(ev, { state, applyOverride, passcode }),
    // Keep scroll positions across the once-a-minute re-render.
    prevScroll: prevBoard && prevBoard.dataset.day === state.day ? { left: prevBoard.scrollLeft, top: prevBoard.scrollTop } : null,
  };
  const scrollY = window.scrollY;
  main.innerHTML = "";
  if (state.view === "board") renderBoard(main, ctx);
  else if (state.view === "now") renderNow(main, ctx);
  else renderPerson(main, ctx);
  if (state.view !== "board") window.scrollTo(0, scrollY);
}

function resolve() {
  const s = state.schedule;
  state.events = resolveEvents(s.events, state.overrides);
}

// ---------- clock ----------
function tickClock() {
  const t = now();
  $("clock-time").textContent = fmt(t.min);
  const day = state.schedule?.days.find((d) => d.date === t.date);
  $("clock-label").textContent = isSimulated() ? "simulated time" : day ? `Shanghai · ${day.label}` : "Shanghai";
  $("clock").classList.toggle("simulated", isSimulated());
}
let lastMinute = -1;
function minuteLoop() {
  tickClock();
  const m = now().min;
  if (m !== lastMinute) {
    lastMinute = m;
    if (state.schedule) render();
  }
}

// ---------- banner ----------
function setBanner(text, kind = "") {
  const b = $("banner");
  if (!text) { b.hidden = true; return; }
  b.hidden = false;
  b.textContent = text;
  b.className = "banner " + kind;
}

// ---------- data loading ----------
async function loadAll() {
  try {
    const [schedule, overrides] = await Promise.all([api.schedule(), api.overrides()]);
    state.schedule = schedule;
    state.overrides = overrides;
    state.lastFetch = new Date();
    state.offlineSince = null;
    cache.set("schedule", schedule);
    cache.set("overrides", overrides);
    cache.set("lastFetch", state.lastFetch.toISOString());
    setBanner("");
  } catch (err) {
    const cached = cache.get("schedule");
    if (!cached) {
      setBanner("Can't reach the server and nothing is cached yet. Check the connection and reload.", "error");
      return false;
    }
    state.schedule = cached;
    state.overrides = cache.get("overrides") ?? {};
    const at = cache.get("lastFetch");
    setBanner(`Offline — showing the schedule as of ${at ? new Date(at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "last visit"}.`);
  }
  resolve();
  return true;
}

async function pollOverrides() {
  if (document.hidden) return;
  try {
    const o = await api.overrides();
    const changed = JSON.stringify(o) !== JSON.stringify(state.overrides);
    state.overrides = o;
    cache.set("overrides", o);
    cache.set("lastFetch", new Date().toISOString());
    if (state.offlineSince) { state.offlineSince = null; setBanner(""); }
    if (changed) { resolve(); render(); }
  } catch {
    if (!state.offlineSince) {
      state.offlineSince = new Date();
      setBanner("Offline — changes made on other devices won't show until the connection is back.");
    }
  }
}

/** Called by the sheet after a successful save/reset. */
export function applyOverride(eventId, value) {
  if (value) state.overrides[eventId] = value; else delete state.overrides[eventId];
  cache.set("overrides", state.overrides);
  resolve();
  render();
}

// ---------- editing / passcode ----------
export function passcode() { return cache.get("passcode") ?? ""; }

function setEditing(on) {
  state.editing = on;
  if (!on) cache.del("passcode");
  renderChrome();
  render();
}

function setupUnlock() {
  const dlg = $("unlock");
  const form = $("unlock-form");
  const input = $("unlock-input");
  const error = $("unlock-error");
  $("lock").addEventListener("click", () => {
    if (state.editing) { setEditing(false); return; }
    error.hidden = true;
    input.value = "";
    dlg.showModal();
    setTimeout(() => input.focus(), 50);
  });
  $("unlock-cancel").addEventListener("click", () => dlg.close());
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const code = input.value.trim();
    const btn = form.querySelector('[type="submit"]');
    btn.disabled = true;
    try {
      await api.unlock(code);
      cache.set("passcode", code);
      dlg.close();
      setEditing(true);
    } catch (err) {
      error.hidden = false;
      error.textContent = err.status === 401 ? "That passcode isn't right." : err.message || "Couldn't reach the server.";
    } finally {
      btn.disabled = false;
    }
  });
}

// ---------- boot ----------
async function boot() {
  setupUnlock();
  const ok = await loadAll();
  if (!ok) return;
  // Re-validate a remembered passcode silently; drop it if it no longer works.
  if (passcode()) {
    try { await api.unlock(passcode()); state.editing = true; } catch (err) { if (err.status === 401) cache.del("passcode"); }
  }
  window.addEventListener("hashchange", applyRoute);
  applyRoute();
  tickClock();
  setInterval(minuteLoop, 1000);
  setInterval(pollOverrides, POLL_MS);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { pollOverrides(); render(); } });
  $("density").addEventListener("click", () => { setDensity(getDensity() === "compact" ? "detailed" : "compact"); render(); });
  $("sheet-backdrop").addEventListener("click", closeSheet);
  window.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSheet(); });
}
boot();
