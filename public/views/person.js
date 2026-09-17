import { fmt, now } from "../lib/time.js";
import { esc, orderedPeople, KIND_LABEL } from "../lib/html.js";
import { personDay, summarize } from "../lib/model.js";

export function renderPerson(root, { state, onEvent }) {
  const { schedule, events, day, person } = state;
  const dayInfo = schedule.days.find((d) => d.id === day);
  const t = now();
  const nowMin = dayInfo.date === t.date ? t.min : null;
  const p = schedule.people.find((x) => x.id === person) ?? schedule.people[0];

  const pick = document.createElement("nav");
  pick.className = "person-pick";
  pick.setAttribute("aria-label", "Person");
  pick.innerHTML = orderedPeople(schedule.people)
    .map((x) => `<a href="#/${day}/person/${x.id}" ${x.id === p.id ? 'aria-current="page"' : ""}><b>${esc(x.name)}</b><small>${esc(x.skill)}</small></a>`)
    .join("");
  root.appendChild(pick);
  pick.querySelector('[aria-current="page"]')?.scrollIntoView({ inline: "center", block: "nearest" });

  const evs = personDay(events.filter((e) => e.day === day), day, p.id);
  const sum = summarize(evs, nowMin);

  const wrap = document.createElement("section");
  wrap.className = "person";
  const sumParts = [];
  if (sum.first) sumParts.push(`<span><span class="k">Start</span><b>${fmt(sum.first.s)}</b></span>`);
  if (sum.allocated) sumParts.push(`<span><span class="k">Lunch</span><b>${fmt(sum.allocated.s)}–${fmt(sum.allocated.e)}</b>${sum.lunchMismatch === "none" ? ' <span class="badge badge-warn">outside skill break</span>' : sum.lunchMismatch === "partial" ? ' <span class="badge badge-warn">partly outside break</span>' : ""}</span>`);
  if (sum.lunch) sumParts.push(`<span><span class="k">${sum.allocated ? "Skill break" : "Lunch"}</span><b>${fmt(sum.lunch.s)}–${fmt(sum.lunch.e)}</b></span>`);
  if (sum.finish) sumParts.push(`<span><span class="k">Finish</span><b>${fmt(sum.finish.s)}</b></span>`);

  let body;
  if (evs.length === 0) {
    body = `<div class="empty"><strong>${p.role === "leader" ? "No schedule yet" : "No timetable for " + esc(dayInfo.label)}</strong>${
      p.role === "leader" ? "Add it to data/src/leader.txt and rebuild." : "This skill hasn't published a timetable for this day."
    }</div>`;
  } else {
    body = `<ol class="tl">${evs.map((ev) => item(ev, nowMin)).join("")}</ol>`;
  }

  wrap.innerHTML = `
    <div class="person-head"><h2>${esc(p.name)}</h2><span class="sk">${esc(p.skill)}</span></div>
    ${sumParts.length ? `<div class="person-sum">${sumParts.join("")}</div>` : ""}
    ${body}`;
  wrap.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-id]");
    if (!btn) return;
    const ev = evs.find((x) => x.id === btn.dataset.id);
    if (ev) onEvent(ev);
  });
  root.appendChild(wrap);
}

function item(ev, nowMin) {
  const cls = [`k-${ev.kind}`];
  if (nowMin != null && ev.e <= nowMin && !(ev.point && ev.s === nowMin)) cls.push("past");
  if (nowMin != null && ev.s <= nowMin && nowMin < ev.e) cls.push("current");
  const orig = ev.changed ? `<span class="orig">${fmt(ev.origS)}${ev.origS !== ev.origE ? "–" + fmt(ev.origE) : ""}</span>` : "";
  return `
    <li class="${cls.join(" ")}">
      <button type="button" data-id="${ev.id}">
        <span class="tm ${ev.changed ? "changed" : ""}">${fmt(ev.s)}${ev.point ? "" : `<span class="end">to ${fmt(ev.e)}</span>`}${orig}</span>
        <span class="bd"><span class="ti">${esc(ev.title)}</span><span class="kd">${KIND_LABEL[ev.kind] ?? ev.kind}${ev.changed ? ' · <span class="badge badge-changed">moved</span>' : ""}</span></span>
      </button>
    </li>`;
}
