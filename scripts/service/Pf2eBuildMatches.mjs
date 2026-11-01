import { PACKS, allowsBaseName, candidateRows, entryOutcome, matchEntry } from "./CompendiumMatch.mjs";
import { compendiumSource, customSource } from "./Pf2eItemSources.mjs";
import { coinEntries } from "./Pf2eGearSources.mjs";
import { listOf } from "../util/ObjectLists.mjs";
import { IDENTITY_KINDS } from "./Pf2eItemTypes.mjs";

const ENTRY_LISTS = ["features", "actions", "spells", "inventory", "coins"];

/** The compendium packs a recipe needs indexed: those of the identity it names and of the lists it fills. */
export function neededPacks(recipe) {
  const lists = IDENTITY_KINDS.filter((kind) => nameOf(recipe?.identity?.[kind]) !== "");
  for (const list of ENTRY_LISTS) {
    if (recipeEntries(recipe, list).length > 0) lists.push(list);
  }
  return [...new Set(lists.flatMap((list) => PACKS[list]))];
}

/**
 * Every recipe entry matched against the index rows (`rowsByPack`: pack id → rows): `identity` by kind (null when not
 * named) and `entries` (features, actions, spells, inventory, coins in that order), each `{key, list, name, entry,
 * status, row, suffix, count}` with status compendium, custom, ambiguous or missing; `electrum` = the ep the coins hold.
 */
export function recipeMatches(recipe, rowsByPack, sluggify) {
  const identity = {};
  for (const kind of IDENTITY_KINDS) identity[kind] = identityMatch(recipe?.identity?.[kind], kind, rowsByPack, sluggify);
  const entries = [];
  for (const list of ENTRY_LISTS) {
    const rows = candidateRows(list, rowsByPack);
    for (const entry of recipeEntries(recipe, list)) entries.push(listMatch(entry, list, rows, sluggify));
  }
  return { identity, entries, electrum: coinEntries(recipe?.coins).electrum };
}

/** Whether the recipe's class has exactly one compendium match (without one nothing is built). */
export function classMatched(matches) {
  return matches?.identity?.class?.status === "compendium";
}

/** The compendium ids to load per pack (one request each) for every identity and entry match. */
export function packIdsOf(matches) {
  const ids = new Map();
  for (const match of allMatches(matches)) {
    if (match.status !== "compendium") continue;
    if (!ids.has(match.row.pack)) ids.set(match.row.pack, []);
    const packIds = ids.get(match.row.pack);
    if (!packIds.includes(match.row.id)) packIds.push(match.row.id);
  }
  return ids;
}

/** The key under which a loaded pack source is looked up. */
export function loadedKey(packId, id) {
  return `${packId}/${id}`;
}

/**
 * The item source of every match that has one, by build key (identity under `id:<kind>`): compendium sources from
 * `loaded` (loadedKey → toObject() source) with the gear entry's runes and the coin quantity, custom ones from the
 * entry's document.
 */
export function matchSources(matches, loaded) {
  const sources = new Map();
  for (const match of allMatches(matches)) {
    const source = sourceOf(match, loaded);
    if (source) sources.set(match.key, source);
  }
  return sources;
}

/** The report lists of the matching: missing and ambiguous entries (the class included) and the custom ones. */
export function matchFindings(matches) {
  const findings = { missing: [], ambiguous: [], custom: [] };
  for (const match of allMatches(matches)) {
    const row = { list: reportList(match.list), name: match.name };
    if (match.status === "missing") findings.missing.push(row);
    if (match.status === "ambiguous") findings.ambiguous.push({ ...row, count: match.count });
    if (match.status === "custom") findings.custom.push(row);
  }
  if (matches?.electrum > 0) findings.missing.push({ list: "coins", name: `${matches.electrum} ep` });
  return findings;
}

function identityMatch(identity, kind, rowsByPack, sluggify) {
  const name = nameOf(identity);
  if (name === "") return null;
  const match = matchEntry(name, candidateRows(kind, rowsByPack), { sluggify, baseName: true });
  return matchRecord({ key: identity.key ?? `id:${kind}`, name }, kind, match);
}

function listMatch(entry, list, rows, sluggify) {
  const options = { category: entry.category ?? null, sluggify, baseName: allowsBaseName(list, entry) };
  return matchRecord(entry, list, matchEntry(entry.name, rows, options));
}

function matchRecord(entry, list, match) {
  return {
    key: entry.key,
    list,
    name: entry.name,
    entry,
    status: entryOutcome(match, entry),
    row: match.row ?? null,
    suffix: match.suffix ?? null,
    count: match.count ?? 0
  };
}

function sourceOf(match, loaded) {
  if (match.status === "custom") return customSource(match.entry.document, match.key);
  if (match.status !== "compendium") return null;
  const source = loaded?.get(loadedKey(match.row.pack, match.row.id));
  if (!source) return null;
  const runes = match.list === "inventory" ? match.entry.runes ?? null : null;
  const shaped = compendiumSource(source, match.row.uuid, match.key, runes);
  if (match.list === "coins") shaped.system = { ...(shaped.system ?? {}), quantity: match.entry.quantity };
  return shaped;
}

/** The recipe entries of a list; spells carry the key of their spellcasting entry, coins their currency slug as name. */
function recipeEntries(recipe, list) {
  if (list === "spells") return recipeSpells(recipe);
  if (list === "coins") return coinEntries(recipe?.coins).entries.map((coin) => ({ ...coin, name: coin.slug }));
  return listOf(recipe?.[list]).filter((entry) => nameOf(entry) !== "");
}

function recipeSpells(recipe) {
  const spells = [];
  for (const casting of listOf(recipe?.spellcasting)) {
    for (const spell of listOf(casting.spells)) {
      if (nameOf(spell) !== "") spells.push({ ...spell, castingKey: casting.key });
    }
  }
  return spells;
}

function allMatches(matches) {
  const identity = Object.values(matches?.identity ?? {}).filter(Boolean);
  return [...identity, ...(matches?.entries ?? [])];
}

function reportList(list) {
  return IDENTITY_KINDS.includes(list) ? "identity" : list;
}

function nameOf(entry) {
  return typeof entry?.name === "string" ? entry.name.trim() : "";
}
