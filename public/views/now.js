import { fmt, now, relative } from "../lib/time.js";
import { esc, orderedPeople } from "../lib/html.js";
import { personDay, summarize } from "../lib/model.js";

export function renderNow(root, { state, navigate }) {
  const { schedule, events, day } = state;
  const dayInfo = schedule.days.find((d) => d.id === day);
  const t = now();
  const live = dayInfo.date === t.date;
  const nowMin = live ? t.min : null;
  const dayEvents = events.filter((e) => e.day === day);

  const rows = orderedPeople(schedule.people).map((p) => {
    const evs = personDay(dayEvents, day, p.id);
    return { p, evs, sum: summarize(evs, nowMin) };
  });

  if (live) {
    // Soonest change first; finished people sink; leader stays pinned on top.
    rows.sort((a, b) => {
      if (a.p.role !== b.p.role) return a.p.role === "leader" ? -1 : 1;
      if (a.sum.done !== b.sum.done) return a.sum.done ? 1 : -1;
      return a.sum.nextTransition - b.sum.nextTransition;
    });
  }

  const list = document.createElement("div");
  list.className = "now-list";
  list.innerHTML = rows.map(({ p, evs, sum }) => card(p, evs, sum, nowMin, live)).join("");
  list.addEventListener("click", (e) => {
    const card = e.target.closest("[data-person]");
    if (card) navigate({ view: "person", person: card.dataset.person });
  });

  if (!live) {
    const note = document.createElement("p");
    note.className = "hint";
    note.style.padding = "12px 16px 0";
    note.textContent = `${dayInfo.label} is ${dayInfo.date < t.date ? "over" : "not today"} — showing the planned day. Live status appears on the day itself.`;
    root.appendChild(note);
  }
  root.appendChild(list);
}

function card(p, evs, sum, nowMin, live) {
  const isLeader = p.role === "leader";
  const lines = [];

  if (sum.noTimetable || evs.length === 0) {
    lines.push(line("", sum.noTimetable ? "No timetable published" : isLeader ? "No schedule yet" : "Not on site today", "muted"));
  } else if (live) {
    if (sum.done) lines.push(line("Now", "Done for the day", "muted"));
    else if (sum.headline) {
      const h = sum.headline;
      lines.push(line("Now", `${esc(h.title)} <span class="t">until ${fmt(h.e)}</span>`, "now" + (["lunch", "allocated-lunch", "break"].includes(h.kind) ? " is-lunch" : "")));
    } else if (sum.next && sum.first && nowMin < sum.first.s) {
      lines.push(line("Now", `Not started <span class="t">· starts ${fmt(sum.first.s)}</span>`, "muted"));
    } else {
      lines.push(line("Now", "Between items", "muted"));
    }
    if (sum.next && !sum.done) {
      lines.push(line("Next", `${esc(sum.next.title)} <span class="t">${fmt(sum.next.s)} · ${relative(nowMin, sum.next.s)}</span>`, "next"));
    }
  } else if (sum.first) {
    lines.push(line("Start", `${esc(sum.first.title)} <span class="t">${fmt(sum.first.s)}</span>`));
  }

  // Lunch: the team's allocated slot is when they actually go; the skill's break is the window it must fit in.
  if (sum.allocated) {
    let v = `${fmt(sum.allocated.s)}–${fmt(sum.allocated.e)}`;
    if (sum.allocated.changed) v += ' <span class="badge badge-changed">moved</span>';
    if (sum.lunchMismatch === "none") v += ' <span class="badge badge-warn">outside skill break</span>';
    else if (sum.lunchMismatch === "partial") v += ' <span class="badge badge-warn">partly outside break</span>';
    else if (sum.lunch) v += ' <span class="badge badge-ok">fits</span>';
    lines.push(line("Lunch", v));
  }
  if (sum.lunches.length) {
    const v = sum.lunches
      .map((l) => `${fmt(l.s)}–${fmt(l.e)}${l.changed ? ' <span class="badge badge-changed">moved</span>' : ""}${sum.lunches.length > 1 ? ` <span class="t">${esc(groupLabel(l.title))}</span>` : ""}`)
      .join(" / ");
    lines.push(line(sum.allocated ? "Skill break" : "Lunch", v, sum.allocated ? "soft" : ""));
  }
  if (!sum.lunches.length && !sum.allocated && evs.length) {
    lines.push(line("Lunch", "Not in timetable", "muted"));
  }

  const fin = sum.finish ?? null;
  const finVal = fin ? fmt(fin.s) : evs.length && !sum.noTimetable ? fmt(sum.lastEnd) : "—";
  const finCls = ["val", fin?.changed ? "changed" : "", live && sum.done ? "done" : ""].join(" ");

  return `
    <button type="button" class="card ${isLeader ? "leader" : ""}" data-person="${p.id}">
      <div class="who"><div class="nm">${esc(p.name)}</div><div class="sk">${esc(p.skill)}</div></div>
      <div class="fin"><div class="lbl">${fin ? "Finish" : "Ends"}</div><div class="${finCls}">${finVal}</div></div>
      ${lines.join("")}
    </button>`;
}

function groupLabel(title) {
  const m = /group\s*(\w+)/i.exec(title);
  return m ? `group ${m[1]}` : "";
}

function line(k, v, cls = "") {
  return `<div class="line ${cls}"><span class="k">${k}</span><span class="v ${cls.includes("muted") ? "muted" : ""}">${v}</span></div>`;
}
