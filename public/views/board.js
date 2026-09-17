import { fmt, now } from "../lib/time.js";
import { esc, orderedPeople } from "../lib/html.js";
import { personDay, packLanes, groupPins, summarize } from "../lib/model.js";

const FOCUS_HOURS = 7; // hours visible at once on the live day
const DENSITY = {
  // Detailed is roomy on purpose: wide hours and tall lanes so labels read at arm's length.
  detailed: { lane: 42, pinStrip: 22, minRow: 88, minPxHour: 128 },
  compact: { lane: 26, pinStrip: 12, minRow: 50, minPxHour: 72 },
};
const MAJOR = new Set(["work", "lunch", "allocated-lunch", "break"]);

export function getDensity() {
  try { return localStorage.getItem("density") === "compact" ? "compact" : "detailed"; } catch { return "detailed"; }
}
export function setDensity(d) {
  try { localStorage.setItem("density", d); } catch {}
}

/** Compact mode: drop a block that fully contains another block of the same kind (the outer label is redundant). */
function dropContainers(blocks) {
  return blocks.filter((a) => !blocks.some((b) => b !== a && b.kind === a.kind && b.s >= a.s && b.e <= a.e && (b.e - b.s) < (a.e - a.s)));
}

export function renderBoard(root, { state, onEvent, prevScroll, rerender }) {
  const { schedule, events, day } = state;
  const dayInfo = schedule.days.find((d) => d.id === day);
  const t = now();
  const nowMin = dayInfo.date === t.date ? t.min : null;
  const dayEvents = events.filter((e) => e.day === day);
  const density = getDensity();
  const compact = density === "compact";
  const { lane: LANE, pinStrip: PIN_STRIP, minRow, minPxHour: MIN_PX_HOUR } = DENSITY[density];

  // Time axis: hour-rounded span of the day's data, at least 07:00–20:00.
  let minH = 7, maxH = 20;
  for (const e of dayEvents) { minH = Math.min(minH, Math.floor(e.s / 60)); maxH = Math.max(maxH, Math.ceil(e.e / 60)); }
  if (nowMin != null) { minH = Math.min(minH, Math.floor(nowMin / 60)); maxH = Math.max(maxH, Math.ceil(nowMin / 60) + 1); }
  const hours = maxH - minH;

  // Zoom: on the live day show a ~7 h window from now (the past scrolls off to the left);
  // otherwise, or when "Whole day" is chosen, fit the day to the screen.
  const nameCol = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--name-col")) || 196;
  const avail = root.clientWidth || window.innerWidth;
  const laneWidth = avail - nameCol - 2;
  const focus = nowMin != null && state.boardZoom !== "day";
  const fitPx = Math.max(MIN_PX_HOUR, Math.floor(laneWidth / hours));
  const pxHour = focus ? Math.max(fitPx, Math.floor(laneWidth / FOCUS_HOURS)) : fitPx;
  const x = (min) => ((min - minH * 60) / 60) * pxHour;

  const board = document.createElement("div");
  board.className = `board ${density}`;
  board.style.setProperty("--lane", `${LANE}px`);
  board.dataset.day = day;
  board.style.setProperty("--px-hour", `${pxHour}px`);
  board.style.setProperty("--hours", hours);
  // Leave room below the sticky header.
  board.style.maxHeight = `calc(100vh - ${document.getElementById("top").offsetHeight}px)`;

  const parts = [];
  parts.push(`<div class="board-grid">`);
  parts.push(
    `<div class="board-axis-corner">${
      nowMin != null
        ? `<button type="button" class="zoom-toggle" id="zoom-toggle" title="Zoom">${focus ? "Whole day" : "Next 7 h"}</button>
           <button type="button" class="jump-now" id="jump-now" title="Scroll to the current time">Now</button>`
        : ""
    }</div>`
  );
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
    let blocks = evs.filter((e) => !e.point);
    let minor = [];
    if (compact) {
      minor = blocks.filter((e) => !MAJOR.has(e.kind));
      blocks = dropContainers(blocks.filter((e) => MAJOR.has(e.kind)));
    }
    const pins = groupPins(evs.filter((e) => e.point));
    const { placed, laneCount } = packLanes(blocks);
    const rowH = Math.max(minRow, PIN_STRIP + laneCount * LANE + 4);
    const isLeader = p.role === "leader";

    // Status line under the name.
    let status = "";
    if (sum.noTimetable) status = `No timetable published`;
    else if (evs.length === 0) status = isLeader ? `No schedule yet` : `Not on site today`;
    else if (nowMin == null) status = `${fmt(sum.first?.s ?? evs[0].s)} – ${fmt(sum.lastEnd)}`;
    else if (sum.done) status = `Done for the day`;
    else if (sum.headline) status = `<b>${esc(shortTitle(sum.headline))}</b> until ${fmt(sum.headline.e)}`;
    else if (sum.next) status = `Next: ${esc(shortTitle(sum.next))} ${fmt(sum.next.s)}`;
    let badge = "";
    if (sum.lunchMismatch === "none") badge = `<span class="badge badge-warn">lunch ≠ allocated</span>`;
    else if (sum.lunchMismatch === "partial") badge = `<span class="badge badge-warn">lunch partly ≠ allocated</span>`;
    // Compact rows keep only the badge: the highlighted block already says what is happening now.
    const statusHtml = compact
      ? (badge ? `<span class="st">${badge}</span>` : "")
      : `<span class="st">${status}${badge ? " " + badge : ""}</span>`;

    parts.push(
      `<div class="row-name ${isLeader ? "leader" : ""}" style="--row-h:${rowH}px">
         <span class="nm">${esc(p.name)}</span>
         <span class="sk">${esc(p.skill)}</span>
         ${statusHtml}
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
      if (nowMin != null && ev.s <= nowMin && nowMin < ev.e) cls.push("current");
      // The team lunch slot is only 30 min but is the block that matters most: label it whenever it fits.
      const isAlloc = ev.kind === "allocated-lunch";
      const tiny = width < (isAlloc ? 40 : 58);
      if (tiny) cls.push("tiny");
      const label = isAlloc ? (width < 96 ? "" : "Lunch") : esc(ev.title);
      parts.push(
        `<button type="button" class="${cls.join(" ")}" data-id="${ev.id}"
                 style="left:${left}px;width:${width}px;top:${PIN_STRIP + lane * LANE + 2}px"
                 title="${esc(ev.title)} ${fmt(ev.s)}–${fmt(ev.e)}">
           ${tiny ? "" : `<span class="ev-t">${fmt(ev.s)}</span>${label ? `<span>${label}</span>` : ""}`}
         </button>`
      );
    }
    for (const ev of minor) {
      const left = x(ev.s), width = Math.max(4, x(ev.e) - x(ev.s));
      parts.push(
        `<button type="button" class="minor mn-${ev.kind} ${ev.changed ? "changed" : ""}" data-id="${ev.id}"
                 style="left:${left}px;width:${width}px" title="${esc(ev.title)} ${fmt(ev.s)}–${fmt(ev.e)}"></button>`
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

  // Horizontal position. On the live day the board follows the clock: the red line sits just
  // right of the name column so what is still to come fills the screen. Scrolling sideways by hand
  // stops the following (the once-a-minute re-render keeps your position); "Now" resumes it.
  const FOLLOW_GAP = 56;
  const follow = nowMin != null && state.boardFollow !== false;
  let programmatic = false;
  const setScroll = (left, top) => {
    programmatic = true;
    board.scrollLeft = left;
    if (top != null) board.scrollTop = top;
    requestAnimationFrame(() => { programmatic = false; });
  };
  if (follow) {
    setScroll(Math.max(0, x(nowMin) - FOLLOW_GAP), prevScroll?.top);
  } else if (prevScroll) {
    setScroll(prevScroll.left, prevScroll.top);
  }
  let lastLeft = board.scrollLeft;
  board.addEventListener("scroll", () => {
    if (programmatic || board.scrollLeft === lastLeft) { lastLeft = board.scrollLeft; return; }
    lastLeft = board.scrollLeft;
    state.boardFollow = false;
    board.querySelector("#jump-now")?.classList.add("away");
  }, { passive: true });
  board.querySelector("#jump-now")?.addEventListener("click", () => {
    state.boardFollow = true;
    setScroll(Math.max(0, x(nowMin) - FOLLOW_GAP));
    board.querySelector("#jump-now").classList.remove("away");
  });
  if (!follow && nowMin != null) board.querySelector("#jump-now")?.classList.add("away");
  board.querySelector("#zoom-toggle")?.addEventListener("click", () => {
    state.boardZoom = focus ? "day" : "focus";
    state.boardFollow = true;
    rerender();
  });
}

function shortTitle(ev) {
  const t = ev.title;
  return t.length > 42 ? t.slice(0, 40).trimEnd() + "…" : t;
}
