const TOTALS_KEY = "ORGANIZR.Build.Totals.";
const FIXED_KEYS = [
  "level", "hp", "ac", "perception", "classDc", "speed", "focusMax",
  "abilities.str", "abilities.dex", "abilities.con", "abilities.int", "abilities.wis", "abilities.cha",
  "saves.fortitude", "saves.reflex", "saves.will"
];
const NAMED_KEYS = [
  { prefix: "spellcasting.", suffix: ".dc", langKey: `${TOTALS_KEY}SpellDc` },
  { prefix: "spellcasting.", suffix: ".attack", langKey: `${TOTALS_KEY}SpellAttack` },
  { prefix: "strikes.", suffix: ".attack", langKey: `${TOTALS_KEY}StrikeAttack` }
];
const SKILL_PREFIX = "skills.";
const LORE_PREFIX = "lores.";

/**
 * How the card names a totals difference key: `{langKey, data}` to format, `{skill}` for pf2e's skill label or `{text}`
 * as is (lores by their key words, unknown keys raw).
 */
export function differenceLabel(key) {
  const text = String(key ?? "");
  if (FIXED_KEYS.includes(text)) return { langKey: TOTALS_KEY + text, data: {} };
  if (text.startsWith(SKILL_PREFIX)) return { skill: text.slice(SKILL_PREFIX.length) };
  if (text.startsWith(LORE_PREFIX)) return { text: capitalizedWords(text.slice(LORE_PREFIX.length)) };
  const named = NAMED_KEYS.find((candidate) => isNamedKey(text, candidate));
  if (named) return { langKey: named.langKey, data: { name: namePart(text, named) } };
  return { text };
}

function isNamedKey(text, candidate) {
  return text.startsWith(candidate.prefix) && text.endsWith(candidate.suffix)
    && text.length > candidate.prefix.length + candidate.suffix.length;
}

function namePart(text, candidate) {
  return text.slice(candidate.prefix.length, text.length - candidate.suffix.length);
}

/** "warfare-lore" → "Warfare Lore". */
function capitalizedWords(slug) {
  return slug.split("-").filter(Boolean).map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}
