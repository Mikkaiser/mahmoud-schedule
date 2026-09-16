import { fmt, now } from "../lib/time.js";
import { esc, orderedPeople } from "../lib/html.js";
import { personDay, packLanes, groupPins, summarize } from "../lib/model.js";

const LANE = 30;
const PIN_STRIP = 16;
const ALLOC_STRIP = 14;
const MIN_PX_HOUR = 72;

export function renderBoard(root, { state, onEvent, prevScroll }) {
  const { schedule, events, day } = state;
  const dayInfo = schedule.days.find((d) => d.id === day);
  const t = now();
  const nowMin = dayInfo.date === t.date ? t.min : null;
  const dayEvents = events.filter((e) => e.day === day);

  // Time axis: hour-rounded span of the day's data, at least 07:00–20:00.
  let minH = 7, maxH = 20;
  for (const e of dayEvents) { minH = Math.min(minH, Math.floor(e.s / 60)); maxH = Math.max(maxH, Math.ceil(e.e / 60)); }
  if (nowMin != null) { minH = Math.min(minH, Math.floor(nowMin / 60)); maxH = Math.max(maxH, Math.ceil(nowMin / 60) + 1); }
  const hours = maxH - minH;

  // Fit the whole day when the screen is wide enough; otherwise scroll.
  const nameCol = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--name-col")) || 196;
  const avail = root.clientWidth || window.innerWidth;
  const pxHour = Math.max(MIN_PX_HOUR, Math.floor((avail - nameCol - 2) / hours));
  const x = (min) => ((min - minH * 60) / 60) * pxHour;

  const board = document.createElement("div");
  board.className = "board";
  board.dataset.day = day;
  board.style.setProperty("--px-hour", `${pxHour}px`);
  board.style.setProperty("--hours", hours);
  // Leave room below the sticky header.
  board.style.maxHeight = `calc(100vh - ${document.getElementById("top").offsetHeight}px)`;

  const parts = [];
  parts.push(`<div class="board-grid">`);
  parts.push(`<div class="board-axis-corner"></div>`);
  parts.push(`<div class="board-axis">`);
  for (let h = minH; h <= maxH; h++) {
    const edge = h === minH ? "first" : h === maxH ? "last" : "";
    parts.push(`<span class="axis-hour ${edge}" style="left:${x(h * 60)}px">${String(h).padStart(2, "0")}:00</span>`);
  }
  if (nowMin != null) parts.push(`<span class="now-tag" style="left:${x(nowMin)}px">${fmt(nowMin)}</span>`);
  parts.push(`</div>`);

  const people = orderedPeople(schedule.people);
  for (const p of people) {
    const evs = personDay(dayEvents, day, p.id);
    const sum = summarize(evs, nowMin);
    const blocks = evs.filter((e) => !e.point && e.kind !== "allocated-lunch");
    const allocated = evs.filter((e) => e.kind === "allocated-lunch");
    const pins = groupPins(evs.filter((e) => e.point));
    const { placed, laneCount } = packLanes(blocks);
    const rowH = Math.max(60, PIN_STRIP + laneCount * LANE + (allocated.length ? ALLOC_STRIP : 4));
    const isLeader = p.role === "leader";

    // Status line under the name.
    let status = "";
    if (sum.noTimetable) status = `No timetable published`;
    else if (evs.length === 0) status = isLeader ? `No schedule yet` : `Not on site today`;
    else if (nowMin == null) status = `${fmt(sum.first?.s ?? evs[0].s)} – ${fmt(sum.lastEnd)}`;
    else if (sum.done) status = `Done for the day`;
    else if (sum.headline) status = `<b>${esc(shortTitle(sum.headline))}</b> until ${fmt(sum.headline.e)}`;
    else if (sum.next) status = `Next: ${esc(shortTitle(sum.next))} ${fmt(sum.next.s)}`;
    if (sum.lunchMismatch === "none") status += ` <span class="badge badge-warn">lunch ≠ allocated</span>`;
    else if (sum.lunchMismatch === "partial") status += ` <span class="badge badge-warn">lunch partly ≠ allocated</span>`;

    parts.push(
      `<div class="row-name ${isLeader ? "leader" : ""}" style="--row-h:${rowH}px">
         <span class="nm">${esc(p.name)}</span>
         <span class="sk">${esc(p.skill)}</span>
         <span class="st">${status}</span>
       </div>`
    );
    parts.push(`<div class="row-lanes ${isLeader ? "leader" : ""}" style="--row-h:${rowH}px" data-person="${p.id}">`);
    if (sum.noTimetable && sum.allocated) {
      parts.push(`<span class="no-tt">Only the allocated lunch (${fmt(sum.allocated.s)}–${fmt(sum.allocated.e)}) is published</span>`);
    } else if (evs.length === 0) {
      parts.push(`<span class="no-tt">${isLeader ? "Add Mahmoud's timetable in data/src/leader.txt" : "No timetable for this day"}</span>`);
    }
    for (const { ev, lane } of placed) {
      const left = x(ev.s), width = Math.max(6, x(ev.e) - x(ev.s));
      const cls = ["ev", `ev-${ev.kind}`];
      if (ev.changed) cls.push("changed");
      if (nowMin != null && ev.e <= nowMin) cls.push("past");
      if (nowMin != null && ev.s <= nowMin && nowMin < ev.e && ev.kind !== "allocated-lunch") cls.push("current");
      const tiny = width < 58;
      if (tiny) cls.push("tiny");
      parts.push(
        `<button type="button" class="${cls.join(" ")}" data-id="${ev.id}"
                 style="left:${left}px;width:${width}px;top:${PIN_STRIP + lane * LANE + 2}px"
                 title="${esc(ev.title)} ${fmt(ev.s)}–${fmt(ev.e)}">
           ${tiny ? "" : `<span class="ev-t">${fmt(ev.s)}</span><span>${esc(ev.title)}</span>`}
         </button>`
      );
    }
    for (const ev of allocated) {
      const left = x(ev.s), width = Math.max(6, x(ev.e) - x(ev.s));
      parts.push(
        `<button type="button" class="alloc ${ev.changed ? "changed" : ""}" data-id="${ev.id}"
                 style="left:${left}px;width:${width}px;top:${PIN_STRIP + laneCount * LANE + 2}px"
                 title="Allocated lunch ${fmt(ev.s)}–${fmt(ev.e)}"><span></span></button>`
      );
    }
    for (const pin of pins) {
      const isFinish = pin.evs.some((e) => e.kind === "finish");
      const changed = pin.evs.some((e) => e.changed);
      parts.push(
        `<button type="button" class="pin ${isFinish ? "pin-finish" : ""} ${changed ? "changed" : ""}" data-id="${pin.evs[0].id}"
                 style="left:${x(pin.min)}px" title="${esc(pin.evs.map((e) => `${fmt(e.s)} ${e.title}`).join(" · "))}">
           <span class="pin-hit"></span>
         </button>`
      );
    }
    parts.push(`</div>`);
  }

  if (nowMin != null) {
    parts.push(`<div class="now-shade" style="width:${x(nowMin) + nameCol}px"></div>`);
    parts.push(`<div class="now-line" style="left:${nameCol + x(nowMin)}px"></div>`);
  }
  parts.push(`</div>`);
  board.innerHTML = parts.join("");

  board.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-id]");
    if (!btn) return;
    const ev = dayEvents.find((x) => x.id === btn.dataset.id);
    if (ev) onEvent(ev);
  });

  root.appendChild(board);

  if (prevScroll) {
    board.scrollLeft = prevScroll.left;
    board.scrollTop = prevScroll.top;
  } else if (nowMin != null) {
    // First paint of a live day: bring the current time into view.
    board.scrollLeft = Math.max(0, x(nowMin) - (avail - nameCol) * 0.35);
  }
}

function shortTitle(ev) {
  const t = ev.title;
  return t.length > 42 ? t.slice(0, 40).trimEnd() + "…" : t;
}
