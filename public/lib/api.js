async function request(path, opts = {}) {
  const res = await fetch(path, { cache: "no-store", ...opts });
  if (!res.ok) {
    let msg = res.statusText;
    try { msg = (await res.json()).error ?? msg; } catch {}
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return res.status === 204 ? null : res.json();
}

const json = (body) => ({ headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export const api = {
  schedule: () => request("/api/schedule"),
  overrides: () => request("/api/overrides"),
  unlock: (passcode) => request("/api/unlock", { method: "POST", ...json({ passcode }) }),
  setOverride: (id, start, end, passcode) =>
    request(`/api/overrides/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "X-Passcode": passcode },
      body: JSON.stringify({ start, end }),
    }),
  clearOverride: (id, passcode) =>
    request(`/api/overrides/${encodeURIComponent(id)}`, { method: "DELETE", headers: { "X-Passcode": passcode } }),
};
