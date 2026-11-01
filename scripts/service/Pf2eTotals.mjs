import { addWholeNumber, isFiniteNumber, wholeNumbers } from "../util/WholeNumbers.mjs";

const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"];
const SAVES = ["fortitude", "reflex", "will"];
const SKILLS = [
  "acrobatics", "arcana", "athletics", "crafting", "deception", "diplomacy", "intimidation", "medicine",
  "nature", "occultism", "performance", "religion", "society", "stealth", "survival", "thievery"
];

/**
 * The totals pf2e prepared for a character actor (the actor itself, not its `system`): level, max HP, AC, perception,
 * land speed, class DC, focus maximum, attribute modifiers, saves, the 16 skills, lores by their skill key, spellcasting
 * DC and attack by entry name and strike attacks by label, all whole numbers. Null when HP, AC, perception or a save
 * is not a number.
 */
export function pf2eDerivedTotals(actor) {
  const core = coreTotals(actor ?? {});
  if (!Object.values(core).every(isFiniteNumber)) return null;
  const whole = wholeNumbers(core);
  const totals = {};
  addWholeNumber(totals, "level", actor.level);
  totals.hp = whole.hp;
  totals.ac = whole.ac;
  totals.perception = whole.perception;
  addWholeNumber(totals, "speed", actor.system?.movement?.speeds?.land?.value);
  addWholeNumber(totals, "classDc", actor.classDC?.dc?.value);
  addWholeNumber(totals, "focusMax", actor.system?.resources?.focus?.max);
  totals.abilities = modifiersOf(actor.abilities, ABILITIES);
  totals.saves = { fortitude: whole.fortitude, reflex: whole.reflex, will: whole.will };
  totals.skills = modifiersOf(actor.skills, SKILLS);
  totals.lores = loreModifiers(actor.skills);
  totals.spellcasting = spellcastingTotals(actor.itemTypes?.spellcastingEntry);
  totals.strikes = strikeAttacks(actor.system?.actions);
  return totals;
}

function coreTotals(actor) {
  const core = {
    hp: actor.hitPoints?.max,
    ac: actor.armorClass?.value,
    perception: actor.perception?.mod
  };
  for (const save of SAVES) core[save] = actor.saves?.[save]?.mod;
  return core;
}

function modifiersOf(statistics, keys) {
  const modifiers = {};
  for (const key of keys) addWholeNumber(modifiers, key, statistics?.[key]?.mod);
  return modifiers;
}

/** The lore statistics among `actor.skills` (`lore: true`), keyed as pf2e keys them. */
function loreModifiers(skills) {
  const modifiers = {};
  for (const [key, statistic] of Object.entries(skills ?? {})) {
    if (statistic?.lore === true) addWholeNumber(modifiers, key, statistic.mod);
  }
  return modifiers;
}

/** DC and attack of every spellcasting entry with both numbers, by entry name; the first entry of a name wins. */
function spellcastingTotals(entries) {
  const totals = {};
  for (const entry of entries ?? []) {
    if (!isNewName(entry?.name, totals)) continue;
    const numbers = { dc: entry.statistic?.dc?.value, attack: entry.statistic?.mod };
    if (Object.values(numbers).every(isFiniteNumber)) totals[entry.name] = wholeNumbers(numbers);
  }
  return totals;
}

/** The attack modifier of every strike action by its label; the first strike of a label wins. */
function strikeAttacks(actions) {
  const attacks = {};
  for (const action of actions ?? []) {
    if (action?.type !== "strike" || !isNewName(action.label, attacks)) continue;
    if (isFiniteNumber(action.totalModifier)) attacks[action.label] = { attack: Math.floor(action.totalModifier) };
  }
  return attacks;
}

function isNewName(name, map) {
  return typeof name === "string" && name !== "" && !Object.hasOwn(map, name);
}
