const PF1_SYSTEM_ID = "pf1";
const SAVES = ["fort", "ref", "will"];

/** Whether a send carries the prepared pf1 totals: NPC actors in a pf1 world. */
export function sendsDerivedTotals(systemId, documentName, type) {
  return systemId === PF1_SYSTEM_ID && documentName === "Actor" && type === "npc";
}

/**
 * The totals pf1 derived for a prepared actor (`actor.system`): AC, touch and flat-footed AC, max HP, BAB, CMB, CMD,
 * initiative, saves and every skill's modifier, all whole numbers. Null when one of the stats is not a number.
 */
export function pf1DerivedTotals(system) {
  const attributes = system?.attributes ?? {};
  const totals = {
    ac: attributes.ac?.normal?.total,
    touchAc: attributes.ac?.touch?.total,
    flatFootedAc: attributes.ac?.flatFooted?.total,
    hp: attributes.hp?.max,
    bab: attributes.bab?.total,
    cmb: attributes.cmb?.total,
    cmd: attributes.cmd?.total,
    init: attributes.init?.total
  };
  for (const save of SAVES) totals[save] = attributes.savingThrows?.[save]?.total;
  if (!Object.values(totals).every(isFiniteNumber)) return null;
  const whole = wholeNumbers(totals);
  whole.skills = skillModifiers(system.skills);
  return whole;
}

function wholeNumbers(values) {
  const whole = {};
  for (const [key, value] of Object.entries(values)) whole[key] = Math.floor(value);
  return whole;
}

function skillModifiers(skills) {
  const modifiers = {};
  for (const [id, skill] of Object.entries(skills ?? {})) {
    if (isFiniteNumber(skill?.mod)) modifiers[id] = Math.floor(skill.mod);
  }
  return modifiers;
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}
