import { toMin } from "./time.js";

/** Apply server overrides to base events; returns events with numeric times. */
export function resolveEvents(events, overrides) {
  return events.map((e) => {
    const o = overrides[e.id];
    const start = toMin(o ? o.start : e.start);
    const end = toMin(o ? o.end : e.end);
    return {
      ...e,
      s: start,
      e: end,
      point: start === end,
      changed: Boolean(o),
      origS: toMin(e.start),
      origE: toMin(e.end),
      updatedAt: o?.updatedAt ?? null,
    };
  });
}

export const isLunch = (e) => e.kind === "lunch";
export const isAllocated = (e) => e.kind === "allocated-lunch";

/** Events for one person on one day, sorted. */
export function personDay(events, dayId, personId) {
  return events
    .filter((e) => e.day === dayId && e.person === personId)
    .sort((a, b) => a.s - b.s || b.e - b.s - (a.e - a.s));
}

function overlaps(a, b) {
  return a.s < b.e && b.s < a.e;
}

/**
 * Summary used by the Now view and the board's name column.
 * `nowMin` is minutes since midnight; pass null when the selected day is not today.
 */
export function summarize(evs, nowMin) {
  const lunches = evs.filter(isLunch);
  const lunch = lunches[0] ?? null;
  const allocated = evs.find(isAllocated) ?? null;
  const finishPins = evs.filter((e) => e.kind === "finish");
  // "Competitor Finish time" is the official one; otherwise the last finish-like pin.
  const finish =
    finishPins.find((e) => /competitor finish/i.test(e.title)) ??
    finishPins[finishPins.length - 1] ??
    null;
  const blocks = evs.filter((e) => !e.point && !isAllocated(e));
  const first = blocks[0] ?? evs[0] ?? null;
  const lastEnd = evs.reduce((m, e) => Math.max(m, e.e), 0);
  const noTimetable = evs.length > 0 && evs.every(isAllocated);

  let current = [], next = null, done = false;
  if (nowMin != null) {
    current = blocks.filter((e) => e.s <= nowMin && nowMin < e.e);
    const upcoming = evs.filter((e) => e.s > nowMin && !isAllocated(e));
    next = upcoming[0] ?? null;
    done = evs.length > 0 && nowMin >= lastEnd;
  }
  // Which block should headline "now"? Prefer lunch/break, then the shortest (most specific) block.
  const headline =
    current.find((e) => e.kind === "lunch" || e.kind === "break") ??
    [...current].sort((a, b) => a.e - a.s - (b.e - b.s))[0] ??
    null;

  // Can the competitor actually be at lunch during the team's allocated slot?
  // "none": no overlap at all; "partial": slot only partly inside a lunch break; null: fits.
  let lunchMismatch = null;
  if (lunch && allocated) {
    if (lunches.some((l) => allocated.s >= l.s && allocated.e <= l.e)) lunchMismatch = null;
    else if (lunches.some((l) => overlaps(l, allocated))) lunchMismatch = "partial";
    else lunchMismatch = "none";
  }
  const lunchDiffers = lunchMismatch !== null;
  const nextTransition =
    headline ? headline.e : next ? next.s : Number.POSITIVE_INFINITY;

  return { lunch, lunches, allocated, finish, first, lastEnd, noTimetable, current, headline, next, done, lunchDiffers, lunchMismatch, nextTransition };
}

/** Greedy lane packing for block events (non-point). Returns [{event, lane}], laneCount. */
export function packLanes(blocks) {
  const sorted = [...blocks].sort((a, b) => a.s - b.s || b.e - b.s - (a.e - a.s));
  const laneEnds = [];
  const placed = sorted.map((ev) => {
    let lane = laneEnds.findIndex((end) => end <= ev.s);
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(0); }
    laneEnds[lane] = ev.e;
    return { ev, lane };
  });
  return { placed, laneCount: Math.max(1, laneEnds.length) };
}

/** Group point events by time so several 17:30 pins become one marker. */
export function groupPins(points) {
  const map = new Map();
  for (const p of points) {
    const k = p.s;
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(p);
  }
  return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([min, evs]) => ({ min, evs }));
}
