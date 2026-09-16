// All times in the app are minutes since midnight, Shanghai wall-clock.
export const TZ = "Asia/Shanghai";

export const toMin = (hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
export const fmt = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

const partsFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
});

// Optional ?now=2026-09-23T12:10 (interpreted as Shanghai wall-clock) for testing.
const simulated = (() => {
  const q = new URLSearchParams(location.search).get("now");
  if (!q) return null;
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})/.exec(q);
  if (!m) return null;
  const startedAt = Date.now();
  return { date: m[1], min: Number(m[2]) * 60 + Number(m[3]), startedAt };
})();

export const isSimulated = () => simulated !== null;

/** @returns {{date: string, min: number, sec: number}} Shanghai date (YYYY-MM-DD) and minutes since midnight */
export function now() {
  if (simulated) {
    const elapsed = (Date.now() - simulated.startedAt) / 1000;
    const totalSec = simulated.min * 60 + elapsed;
    return { date: simulated.date, min: Math.floor(totalSec / 60) % 1440, sec: Math.floor(totalSec % 60) };
  }
  const p = Object.fromEntries(partsFmt.formatToParts(new Date()).map((x) => [x.type, x.value]));
  const hour = p.hour === "24" ? "00" : p.hour;
  return { date: `${p.year}-${p.month}-${p.day}`, min: Number(hour) * 60 + Number(p.minute), sec: Number(p.second) };
}

export function relative(minFrom, minTo) {
  const d = minTo - minFrom;
  if (d === 0) return "now";
  const abs = Math.abs(d);
  const h = Math.floor(abs / 60), m = abs % 60;
  const s = h ? (m ? `${h} h ${m} min` : `${h} h`) : `${m} min`;
  return d > 0 ? `in ${s}` : `${s} ago`;
}

export function weekday(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });
}
export function dayMonth(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}
