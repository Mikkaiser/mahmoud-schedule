import { fmt } from "../lib/time.js";
import { esc, KIND_LABEL } from "../lib/html.js";
import { api } from "../lib/api.js";

const $ = (id) => document.getElementById(id);
let current = null;

export function closeSheet() {
  $("sheet").hidden = true;
  $("sheet-backdrop").hidden = true;
  current = null;
}

/** Show details for an event; in edit mode, allow shifting its times. */
export function openSheet(ev, { state, applyOverride, passcode }) {
  current = ev;
  const person = state.schedule.people.find((p) => p.id === ev.person);
  const day = state.schedule.days.find((d) => d.id === ev.day);
  const body = $("sheet-body");
  const range = (s, e) => (s === e ? fmt(s) : `${fmt(s)}–${fmt(e)}`);

  const updated = ev.updatedAt
    ? `<span class="updated">Changed ${new Date(ev.updatedAt).toLocaleString("en-GB", { timeZone: "Asia/Shanghai", weekday: "short", hour: "2-digit", minute: "2-digit" })} (Shanghai)</span>`
    : "";

  body.innerHTML = `
    <h2 id="sheet-title">${esc(ev.title)}<span class="kind-chip ev-${ev.kind}">${KIND_LABEL[ev.kind] ?? ev.kind}</span></h2>
    <div class="who">${esc(person?.name ?? ev.person)} · ${esc(person?.skill ?? "")} · ${esc(day?.label ?? ev.day)}</div>
    <div class="times">
      <span class="big ${ev.changed ? "changed" : ""}">${range(ev.s, ev.e)}</span>
      ${ev.changed ? `<span class="orig">official ${range(ev.origS, ev.origE)}</span>` : ""}
      ${updated}
    </div>
    ${state.editing ? editForm(ev) : `<p class="hint">${ev.changed ? "This time was changed by the team." : "Official time from the skill's timetable."} Unlock editing to shift it.</p>`}
    <div class="actions">
      ${state.editing && ev.changed ? `<button type="button" class="btn btn-danger" id="sheet-reset">Reset to official</button>` : ""}
      <button type="button" class="btn" id="sheet-close">Close</button>
      ${state.editing ? `<button type="button" class="btn btn-primary" id="sheet-save">Save time</button>` : ""}
    </div>
    <p class="form-error" id="sheet-error" hidden></p>`;

  $("sheet").hidden = false;
  $("sheet-backdrop").hidden = false;
  $("sheet-close").onclick = closeSheet;

  if (!state.editing) return;

  const startIn = $("edit-start"), endIn = $("edit-end"), err = $("sheet-error");
  const showErr = (m) => { err.hidden = false; err.textContent = m; };

  // Quick shift buttons move both start and end together.
  body.querySelectorAll("[data-shift]").forEach((b) =>
    b.addEventListener("click", () => {
      const d = Number(b.dataset.shift);
      startIn.value = fmt(clamp(toMin(startIn.value) + d));
      endIn.value = fmt(clamp(toMin(endIn.value) + d));
    })
  );

  $("sheet-save").onclick = async () => {
    const start = startIn.value, end = endIn.value;
    if (!start || !end) return showErr("Enter both times.");
    if (end < start) return showErr("End can't be before start.");
    setBusy(true);
    try {
      const saved = await api.setOverride(ev.id, start, end, passcode());
      applyOverride(ev.id, saved);
      closeSheet();
    } catch (e) {
      showErr(e.status === 401 ? "Passcode no longer valid — lock and unlock again." : e.message || "Couldn't save. Check the connection.");
    } finally { setBusy(false); }
  };

  $("sheet-reset")?.addEventListener("click", async () => {
    setBusy(true);
    try {
      await api.clearOverride(ev.id, passcode());
      applyOverride(ev.id, null);
      closeSheet();
    } catch (e) {
      showErr(e.message || "Couldn't reset. Check the connection.");
    } finally { setBusy(false); }
  });

  function setBusy(on) {
    for (const b of body.querySelectorAll("button")) b.disabled = on;
  }
}

function editForm(ev) {
  return `
    <div class="quick">
      <button type="button" data-shift="-15">−15 min</button>
      <button type="button" data-shift="15">+15 min</button>
      <button type="button" data-shift="30">+30 min</button>
      <button type="button" data-shift="60">+1 h</button>
    </div>
    <div class="edit-grid">
      <label class="field"><span>Start</span><input type="time" id="edit-start" value="${fmt(ev.s)}" step="300"></label>
      <label class="field"><span>End</span><input type="time" id="edit-end" value="${fmt(ev.e)}" step="300"></label>
    </div>
    <p class="hint">Saved for everyone who opens this page. The official time stays visible, struck through.</p>`;
}

const toMin = (v) => { const [h, m] = v.split(":").map(Number); return h * 60 + m; };
const clamp = (m) => Math.min(23 * 60 + 59, Math.max(0, m));
