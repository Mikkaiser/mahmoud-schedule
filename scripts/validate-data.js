// Sanity checks on the generated data. Run: node scripts/validate-data.js
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => JSON.parse(readFileSync(path.join(__dirname, "..", "data", f), "utf8"));
const schedule = read("schedule.json");
const leader = read("leader.json");

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const days = new Set(schedule.days.map((d) => d.id));
const people = new Set([...schedule.people, ...leader.people].map((p) => p.id));
const ids = new Set();
const problems = [];

for (const e of [...schedule.events, ...leader.events]) {
  if (ids.has(e.id)) problems.push(`duplicate id ${e.id}`);
  ids.add(e.id);
  if (!days.has(e.day)) problems.push(`${e.id}: unknown day ${e.day}`);
  if (!people.has(e.person)) problems.push(`${e.id}: unknown person ${e.person}`);
  if (!TIME_RE.test(e.start) || !TIME_RE.test(e.end)) problems.push(`${e.id}: bad time ${e.start}-${e.end}`);
  if (e.end < e.start) problems.push(`${e.id}: end before start`);
  if (!e.title) problems.push(`${e.id}: empty title`);
}

for (const d of schedule.days) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) problems.push(`day ${d.id}: bad date ${d.date}`);
}

// Every competitor should have a lunch reference on every day (allocated or skill lunch).
for (const d of schedule.days) {
  for (const p of schedule.people) {
    const evs = schedule.events.filter((e) => e.day === d.id && e.person === p.id);
    if (evs.length === 0) { if (!d.note) console.warn(`note: ${p.id} has no events on ${d.id}`); }
    else if (!evs.some((e) => e.kind === "lunch" || e.kind === "allocated-lunch"))
      console.warn(`note: ${p.id} has no lunch on ${d.id}`);
  }
}

if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`ok: ${ids.size} events valid`);
