export const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const KIND_LABEL = {
  work: "Competing",
  briefing: "Briefing",
  lunch: "Skill's lunch break",
  "allocated-lunch": "Lunch (team slot)",
  break: "Break",
  arrival: "Arrival",
  leave: "Leaving",
  finish: "Finish",
  other: "Other",
};

/** People in display order: leader first, then competitors by skill name. */
export function orderedPeople(people) {
  return [...people].sort((a, b) => {
    if (a.role !== b.role) return a.role === "leader" ? -1 : 1;
    return a.skill.localeCompare(b.skill) || a.name.localeCompare(b.name);
  });
}
