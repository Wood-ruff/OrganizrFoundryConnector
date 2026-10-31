const PF1_SYSTEM_ID = "pf1";
const SAVES = ["fort", "ref", "will"];
const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"];
const SPELL_LEVELS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
const TOTALS_ACTOR_TYPES = ["npc", "character"];

/** Whether a send carries the prepared pf1 totals: NPC and character actors in a pf1 world. */
export function sendsDerivedTotals(systemId, documentName, type) {
  return systemId === PF1_SYSTEM_ID && documentName === "Actor" && TOTALS_ACTOR_TYPES.includes(type);
}

/** The prepared totals a send of this document carries in this world's system, or null when it carries none. */
export function derivedTotalsFor(systemId, document) {
  if (!sendsDerivedTotals(systemId, document?.documentName, document?.type)) return null;
  return pf1DerivedTotals(document.system);
}

/**
 * The totals pf1 derived for a prepared actor (`actor.system`, NPC or character): AC, touch and flat-footed AC, max
 * HP, BAB, CMB, CMD, initiative, saves, every skill's modifier, ability totals, land speed, level and the spellbooks in
 * use, all whole numbers. Null when one of the eleven combat numbers is not a number.
 */
export function pf1DerivedTotals(system) {
  const combat = combatTotals(system?.attributes ?? {});
  if (!Object.values(combat).every(isFiniteNumber)) return null;
  const totals = wholeNumbers(combat);
  totals.skills = skillModifiers(system.skills);
  totals.abilities = abilityTotals(system.abilities);
  addWholeNumber(totals, "speed", system.attributes?.speed?.land?.total);
  addWholeNumber(totals, "level", system.details?.level?.value);
  totals.spellbooks = spellbookTotals(system.attributes?.spells?.spellbooks, system.abilities);
  return totals;
}

function combatTotals(attributes) {
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
  return totals;
}

function wholeNumbers(values) {
  const whole = {};
  for (const [key, value] of Object.entries(values)) whole[key] = Math.floor(value);
  return whole;
}

function addWholeNumber(target, key, value) {
  if (isFiniteNumber(value)) target[key] = Math.floor(value);
}

/** Skill modifiers by pf1 id, custom skills by their key, sub-skills as `<id>.<tag>` right after their parent. */
function skillModifiers(skills) {
  const modifiers = {};
  for (const [id, skill] of Object.entries(skills ?? {})) {
    addWholeNumber(modifiers, id, skill?.mod);
    for (const [tag, subSkill] of Object.entries(skill?.subSkills ?? {})) {
      addWholeNumber(modifiers, `${id}.${tag}`, subSkill?.mod);
    }
  }
  return modifiers;
}

function abilityTotals(abilities) {
  const totals = {};
  for (const ability of ABILITIES) addWholeNumber(totals, ability, abilities?.[ability]?.total);
  return totals;
}

function spellbookTotals(spellbooks, abilities) {
  const totals = {};
  for (const [id, book] of Object.entries(spellbooks ?? {})) {
    if (book?.inUse !== true) continue;
    const bookTotals = spellbookOf(book, abilities);
    if (bookTotals) totals[id] = bookTotals;
  }
  return totals;
}

/**
 * A book's caster level, concentration, casting ability modifier (pf1 keeps `book.abilityMod` in roll data only) and
 * slot maxima; null when one of the three numbers is missing.
 */
function spellbookOf(book, abilities) {
  const numbers = {
    cl: book.cl?.total,
    concentration: book.concentration?.total,
    abilityMod: abilities?.[book.ability]?.mod
  };
  if (!Object.values(numbers).every(isFiniteNumber)) return null;
  const totals = wholeNumbers(numbers);
  totals.slots = slotMaxima(book.spells);
  return totals;
}

function slotMaxima(spells) {
  const slots = {};
  for (const level of SPELL_LEVELS) addWholeNumber(slots, String(level), spells?.[`spell${level}`]?.max);
  return slots;
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}
