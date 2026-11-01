import { addWholeNumber, isFiniteNumber, wholeNumbers, wholeOrZero } from "../util/WholeNumbers.mjs";

const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"];
const SKILLS = [
  "acr", "ani", "arc", "ath", "dec", "his", "ins", "itm", "inv",
  "med", "nat", "prc", "prf", "per", "rel", "slt", "ste", "sur"
];
const SPELL_SLOTS = ["spell1", "spell2", "spell3", "spell4", "spell5", "spell6", "spell7", "spell8", "spell9"];

/**
 * The totals dnd5e prepared for an actor (`actor.system`, NPC or character) under the world's rules version: AC, max
 * HP, proficiency, initiative, walking speed, level, CR, exhaustion, abilities, all 18 skills, tools, spellcasting and
 * slot maxima, whole numbers except the CR. Null when AC, max HP, proficiency or initiative is not a number.
 */
export function dnd5eDerivedTotals(system, rulesVersion) {
  const attributes = system?.attributes ?? {};
  const core = coreTotals(attributes);
  if (!Object.values(core).every(isFiniteNumber)) return null;
  const totals = { rules: rulesText(rulesVersion), ...wholeNumbers(core) };
  addWholeNumber(totals, "speed", attributes.movement?.speeds?.walk);
  addPositiveLevel(totals, system.details?.level);
  addCr(totals, system.details?.cr);
  totals.exhaustion = wholeOrZero(attributes.exhaustion);
  totals.abilities = abilityTotals(system.abilities);
  totals.skills = skillTotals(system.skills);
  totals.tools = toolTotals(system.tools);
  totals.spell = spellTotals(attributes);
  totals.slots = slotMaxima(system.spells);
  return totals;
}

function coreTotals(attributes) {
  return {
    ac: attributes.ac?.value,
    hp: attributes.hp?.max,
    prof: attributes.prof,
    init: attributes.init?.total
  };
}

function rulesText(rulesVersion) {
  return typeof rulesVersion === "string" ? rulesVersion : "";
}

function addPositiveLevel(target, level) {
  if (isFiniteNumber(level) && level > 0) target.level = Math.floor(level);
}

function addCr(target, cr) {
  if (isFiniteNumber(cr)) target.cr = cr;
}

function abilityTotals(abilities) {
  const totals = {};
  for (const key of ABILITIES) {
    const ability = abilities?.[key];
    totals[key] = {
      score: wholeOrZero(ability?.value),
      mod: wholeOrZero(ability?.mod),
      save: wholeOrZero(ability?.save?.value)
    };
  }
  return totals;
}

function skillTotals(skills) {
  const totals = {};
  for (const key of SKILLS) {
    const skill = skills?.[key];
    totals[key] = { total: wholeOrZero(skill?.total), passive: wholeOrZero(skill?.passive) };
  }
  return totals;
}

function toolTotals(tools) {
  const totals = {};
  for (const [key, tool] of Object.entries(tools ?? {})) totals[key] = wholeOrZero(tool?.total);
  return totals;
}

/** The spellcasting ability (left out when none), spell save DC, spell attack and caster level (left out when none). */
function spellTotals(attributes) {
  const spell = {};
  const ability = attributes.spellcasting;
  if (typeof ability === "string" && ability !== "") spell.ability = ability;
  spell.dc = wholeOrZero(attributes.spell?.dc);
  spell.attack = wholeOrZero(attributes.spell?.attack);
  addWholeNumber(spell, "level", attributes.spell?.level);
  return spell;
}

function slotMaxima(spells) {
  const slots = {};
  for (const key of SPELL_SLOTS) slots[key] = wholeOrZero(spells?.[key]?.max);
  slots.pact = wholeOrZero(spells?.pact?.max);
  slots.pactLevel = wholeOrZero(spells?.pact?.level);
  return slots;
}
