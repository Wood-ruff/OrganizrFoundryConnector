import { baseName } from "./Pf2eRecipe.mjs";
import { PHYSICAL_TYPES } from "./Pf2eItemTypes.mjs";

/** The compendium packs searched per recipe list, in priority order. */
export const PACKS = Object.freeze({
  ancestry: ["pf2e.ancestries"],
  heritage: ["pf2e.heritages"],
  background: ["pf2e.backgrounds"],
  class: ["pf2e.classes"],
  deity: ["pf2e.deities"],
  features: ["pf2e.feats-srd", "pf2e.classfeatures", "pf2e.ancestryfeatures"],
  actions: ["pf2e.actionspf2e"],
  spells: ["pf2e.spells-srd"],
  inventory: ["pf2e.equipment-srd"],
  coins: ["pf2e.equipment-srd"]
});

/** The item types a recipe list may match (pf2e kits never count). */
export const ITEM_TYPES = Object.freeze({
  ancestry: ["ancestry"],
  heritage: ["heritage"],
  background: ["background"],
  class: ["class"],
  deity: ["deity"],
  features: ["feat"],
  actions: ["action"],
  spells: ["spell"],
  inventory: PHYSICAL_TYPES,
  coins: ["treasure"]
});

const COVERING_TYPES = { spell: ["spell"], other: ["feat", "action"] };

/** The index rows a list searches (`rowsByPack`: pack id → rows): its packs' rows by priority, of its item types only. */
export function candidateRows(list, rowsByPack) {
  const types = ITEM_TYPES[list] ?? [];
  const rows = [];
  for (const packId of PACKS[list] ?? []) {
    for (const row of rowsByPack?.get(packId) ?? []) {
      if (types.includes(row?.type)) rows.push(row);
    }
  }
  return rows;
}

/** Whether a "Base (Suffix)" entry may fall back to its base name: never for a spell or gear entry with its own document. */
export function allowsBaseName(list, entry) {
  if (list !== "spells" && list !== "inventory") return true;
  return !entry?.document;
}

/**
 * The compendium row for a name: by slug, else exact name, else trimmed case-insensitive name, else (with `baseName`)
 * the same for "Base" of "Base (Suffix)". Several hits narrow to the entry's category, then to the first pack.
 * → `{status: "compendium", row, suffix}` | `{status: "ambiguous", count}` | `{status: "missing"}`.
 */
export function matchEntry(name, rows, { category = null, sluggify, baseName: tryBaseName = false } = {}) {
  let hits = hitsForName(name, rows, sluggify);
  let suffix = null;
  if (hits.length === 0 && tryBaseName) {
    const parts = baseName(name);
    if (parts.suffix !== null) {
      hits = hitsForName(parts.base, rows, sluggify);
      suffix = parts.suffix;
    }
  }
  return outcomeOf(narrowed(hits, category), suffix);
}

/** What a matched entry becomes: "compendium", "custom" (no single match, own document) or the match's status. */
export function entryOutcome(match, entry) {
  if (match?.status === "compendium") return "compendium";
  if (entry?.document) return "custom";
  return match?.status ?? "missing";
}

/**
 * Whether the actor already holds the entry (a spell entry by spell items, else by feat and action items): a suffixed
 * name only by the same full name, any other by name (case-insensitive) or by `system.slug`.
 */
export function isCovered(entry, actorItems, sluggify) {
  const name = typeof entry?.name === "string" ? entry.name.trim() : "";
  if (name === "") return false;
  const types = isSpellEntry(entry) ? COVERING_TYPES.spell : COVERING_TYPES.other;
  const candidates = [...(actorItems ?? [])].filter((item) => types.includes(item?.type));
  if (baseName(name).suffix !== null) return candidates.some((item) => sameName(item?.name, name));
  const slug = sluggify(name);
  return candidates.some((item) => sameName(item?.name, name) || item?.system?.slug === slug);
}

function hitsForName(name, rows, sluggify) {
  const text = typeof name === "string" ? name.trim() : "";
  if (text === "") return [];
  const list = Array.isArray(rows) ? rows : [];
  const slug = sluggify(text);
  const bySlug = list.filter((row) => slug !== "" && row?.slug === slug);
  if (bySlug.length > 0) return bySlug;
  const exact = list.filter((row) => row?.name === name);
  if (exact.length > 0) return exact;
  return list.filter((row) => sameName(row?.name, text));
}

function narrowed(hits, category) {
  if (hits.length < 2) return hits;
  const byCategory = inCategory(hits, category);
  if (byCategory.length < 2) return byCategory;
  const firstPack = byCategory[0].pack;
  return byCategory.filter((row) => row.pack === firstPack);
}

/** The hits of the category, or all hits when no category is given or none has it. */
function inCategory(hits, category) {
  if (!category) return hits;
  const sameCategory = hits.filter((row) => row.category === category);
  return sameCategory.length > 0 ? sameCategory : hits;
}

function outcomeOf(hits, suffix) {
  if (hits.length === 0) return { status: "missing" };
  if (hits.length > 1) return { status: "ambiguous", count: hits.length };
  return { status: "compendium", row: hits[0], suffix };
}

function isSpellEntry(entry) {
  return typeof entry?.key === "string" && entry.key.includes("/s:");
}

function sameName(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}
