export const RECIPE_FORMAT = "organizr-pf2e-recipe";
export const RECIPE_VERSION = 1;

/** The 16 standard pf2e skill slugs, the keys of a recipe's `skills`. */
export const SKILL_SLUGS = [
  "acrobatics", "arcana", "athletics", "crafting", "deception", "diplomacy", "intimidation", "medicine",
  "nature", "occultism", "performance", "religion", "society", "stealth", "survival", "thievery"
];

const RECIPE_VERSION_ERROR = "ORGANIZR.Build.Errors.RecipeVersion";
const SUFFIXED_NAME = /^(.*\S)\s+\(([^()]*\S[^()]*)\)\s*$/;
const IDENTITY_KINDS = ["ancestry", "heritage", "background", "class", "deity"];

/** The lang key of why a `{document, recipe}` answer cannot be built (no recipe, another format or version), else null. */
export function recipeErrorKey(payload) {
  const recipe = payload?.recipe;
  if (!isPlainObject(recipe)) return RECIPE_VERSION_ERROR;
  if (recipe.format !== RECIPE_FORMAT || recipe.version !== RECIPE_VERSION) return RECIPE_VERSION_ERROR;
  return null;
}

/** "Base (Suffix)" → `{base, suffix}`; a name without a trailing parenthesis keeps itself as base with a null suffix. */
export function baseName(name) {
  const text = typeof name === "string" ? name : "";
  const parts = SUFFIXED_NAME.exec(text);
  if (!parts) return { base: text.trim(), suffix: null };
  return { base: parts[1].trim(), suffix: parts[2].trim() };
}

/**
 * The hints for answering pf2e's choice prompts from a recipe: suffixes by base slug, every name slug, the lowest feature
 * level by slug, the slugs not yet on the actor (`uncovered`, shrunk by `markCovered`), skill ranks and the previous
 * selections by item source id.
 */
export function recipeEvidence(recipe, sluggify, previous = new Map()) {
  const evidence = {
    suffixes: new Map(),
    names: new Set(),
    levels: new Map(),
    uncovered: new Set(),
    skillRanks: skillRanksOf(recipe?.skills),
    previous
  };
  for (const entry of evidenceEntries(recipe)) addEntryEvidence(evidence, entry, sluggify);
  return evidence;
}

/** Removes an item name now on the actor (its full and its base slug) from the evidence's `uncovered` slugs. */
export function markCovered(evidence, name, sluggify) {
  const { base, suffix } = baseName(name);
  evidence.uncovered.delete(sluggify(String(name ?? "").trim()));
  if (suffix !== null) evidence.uncovered.delete(sluggify(base));
}

/** Every named recipe entry with whether its suffix counts as a choice hint and its feature level. */
function evidenceEntries(recipe) {
  const entries = [];
  for (const kind of IDENTITY_KINDS) addEvidenceEntry(entries, recipe?.identity?.[kind], true, null);
  for (const feature of listOf(recipe?.features)) addEvidenceEntry(entries, feature, true, feature.level);
  for (const action of listOf(recipe?.actions)) addEvidenceEntry(entries, action, true, null);
  for (const spell of recipeSpells(recipe)) addEvidenceEntry(entries, spell, !spell.document, null);
  for (const item of listOf(recipe?.inventory)) addEvidenceEntry(entries, item, !item.document, null);
  for (const lore of listOf(recipe?.lores)) addEvidenceEntry(entries, lore, true, null);
  return entries;
}

function addEvidenceEntry(entries, entry, suffixCounts, level) {
  if (typeof entry?.name !== "string" || entry.name.trim() === "") return;
  entries.push({ name: entry.name, suffixCounts, level: Number.isFinite(level) ? level : null });
}

function recipeSpells(recipe) {
  const spells = [];
  for (const entry of listOf(recipe?.spellcasting)) spells.push(...listOf(entry?.spells));
  return spells;
}

function addEntryEvidence(evidence, entry, sluggify) {
  const slugs = [sluggify(entry.name.trim())];
  const { base, suffix } = baseName(entry.name);
  if (suffix !== null && entry.suffixCounts) {
    const baseSlug = sluggify(base);
    addSuffix(evidence.suffixes, baseSlug, sluggify(suffix));
    slugs.push(baseSlug);
  }
  for (const slug of slugs) addSlug(evidence, slug, entry.level);
}

function addSuffix(suffixes, baseSlug, suffixSlug) {
  if (!suffixes.has(baseSlug)) suffixes.set(baseSlug, new Set());
  suffixes.get(baseSlug).add(suffixSlug);
}

function addSlug(evidence, slug, level) {
  if (slug === "") return;
  evidence.names.add(slug);
  evidence.uncovered.add(slug);
  if (level === null) return;
  const known = evidence.levels.get(slug);
  if (known === undefined || level < known) evidence.levels.set(slug, level);
}

function skillRanksOf(skills) {
  const ranks = new Map();
  for (const skill of SKILL_SLUGS) {
    const rank = skills?.[skill];
    ranks.set(skill, Number.isFinite(rank) ? rank : 0);
  }
  return ranks;
}

function listOf(value) {
  return Array.isArray(value) ? value.filter(isPlainObject) : [];
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
