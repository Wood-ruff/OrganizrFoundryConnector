import { isFiniteNumber } from "../util/WholeNumbers.mjs";

const HEADLINE_KEYS = ["level", "hp", "ac", "perception", "classDc", "speed", "focusMax"];
const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"];
const SAVES = ["fortitude", "reflex", "will"];

/**
 * The pf2e totals that differ between Organizr's expectation and Foundry's prepared actor, as `[{key, organizr,
 * foundry}]`: only keys both sides have, in the order level, HP, AC, perception, class DC, speed, focus, abilities,
 * saves, skills and lores (by key), spellcasting (dc, attack) and strikes (both in Organizr's order).
 */
export function totalsDifferences(expected, actual) {
  if (!expected || !actual) return [];
  const differences = [];
  for (const key of HEADLINE_KEYS) addDifference(differences, key, expected[key], actual[key]);
  compareMap(differences, "abilities", ABILITIES, expected.abilities, actual.abilities);
  compareMap(differences, "saves", SAVES, expected.saves, actual.saves);
  compareMap(differences, "skills", sortedKeys(expected.skills), expected.skills, actual.skills);
  compareMap(differences, "lores", sortedKeys(expected.lores), expected.lores, actual.lores);
  compareSpellcasting(differences, expected.spellcasting, actual.spellcasting);
  compareStrikes(differences, expected.strikes, actual.strikes);
  return differences;
}

function compareMap(differences, prefix, keys, expected, actual) {
  for (const key of keys) addDifference(differences, `${prefix}.${key}`, ownValue(expected, key), ownValue(actual, key));
}

function compareSpellcasting(differences, expected, actual) {
  for (const name of Object.keys(expected ?? {})) {
    const organizr = expected[name];
    const foundry = ownValue(actual, name);
    if (!foundry) continue;
    addDifference(differences, `spellcasting.${name}.dc`, organizr?.dc, foundry.dc);
    addDifference(differences, `spellcasting.${name}.attack`, organizr?.attack, foundry.attack);
  }
}

function compareStrikes(differences, expected, actual) {
  for (const name of Object.keys(expected ?? {})) {
    addDifference(differences, `strikes.${name}.attack`, expected[name]?.attack, ownValue(actual, name)?.attack);
  }
}

function addDifference(differences, key, organizr, foundry) {
  if (!isFiniteNumber(organizr) || !isFiniteNumber(foundry) || organizr === foundry) return;
  differences.push({ key, organizr, foundry });
}

/** Keys in code-unit order, the order Java's TreeSet gives the server's note. */
function sortedKeys(values) {
  return Object.keys(values ?? {}).sort();
}

function ownValue(values, key) {
  if (!values || !Object.hasOwn(values, key)) return undefined;
  return values[key];
}
