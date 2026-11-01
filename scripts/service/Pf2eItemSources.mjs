import { MODULE_ID } from "../config/ModuleId.mjs";
import { listOf } from "../util/ObjectLists.mjs";

/** A compendium item source ready to embed: no `_id`, `_stats.compendiumSource` set, the build key flag, optional runes. */
export function compendiumSource(source, uuid, key, runes = null) {
  const shaped = structuredClone(source ?? {});
  delete shaped._id;
  shaped._stats = { ...(shaped._stats ?? {}), compendiumSource: uuid };
  if (runes) {
    shaped.system = shaped.system ?? {};
    shaped.system.runes = structuredClone(runes);
  }
  return withBuildFlag(shaped, { key });
}

/** An Organizr linked-sheet export ready to embed: no `_id`, `sort` or `_stats` (pf2e rejects foreign export uuids). */
export function customSource(document, key) {
  const shaped = structuredClone(document ?? {});
  delete shaped._id;
  delete shaped.sort;
  delete shaped._stats;
  return withBuildFlag(shaped, { key });
}

/** The feat source placed in a free feat slot (location and taken level), or left for pf2e to place when slot is null. */
export function slottedFeat(source, slot) {
  const shaped = structuredClone(source ?? {});
  shaped.system = shaped.system ?? {};
  if (!slot) {
    shaped.system.location = null;
    return shaped;
  }
  shaped.system.location = slot.slotId;
  shaped.system.level = { ...(shaped.system.level ?? {}), taken: slot.level };
  return shaped;
}

/** The build key the connector stamped on an item source, or null for an item it did not build. */
export function buildKeyOf(itemSource) {
  const key = itemSource?.flags?.[MODULE_ID]?.build?.key;
  return typeof key === "string" ? key : null;
}

/** The key of the recipe entry an item the build did not create stands in for (`build.covers`), or null. */
export function coversOf(itemSource) {
  const key = itemSource?.flags?.[MODULE_ID]?.build?.covers;
  return typeof key === "string" ? key : null;
}

/** The build id of the actor whose build created this item source, or null (none recorded). */
export function buildOwnerOf(itemSource) {
  const owner = itemSource?.flags?.[MODULE_ID]?.build?.owner;
  return typeof owner === "string" ? owner : null;
}

/** A copy of a source with a build key that also names the build creating it; a source without a key is copied as is. */
export function withBuildOwner(source, buildId) {
  const key = buildKeyOf(source);
  if (key === null || typeof buildId !== "string") return structuredClone(source ?? {});
  return withBuildFlag(source, { ...source.flags[MODULE_ID].build, owner: buildId });
}

/** A copy of the source whose `flags[MODULE].build` is the given value (other module flags kept). */
export function withBuildFlag(source, build) {
  const shaped = structuredClone(source ?? {});
  shaped.flags = shaped.flags ?? {};
  shaped.flags[MODULE_ID] = { ...(shaped.flags[MODULE_ID] ?? {}), build: { ...build } };
  return shaped;
}

/**
 * The lore items to create (none of that lore on the actor) and the rank raises for lores the actor holds at a lower rank
 * (`[{_id, "system.proficient.value"}]`). Lores match by pf2e's lore key, so "Library" finds "Library Lore".
 */
export function loreSources(lores, actorItems, sluggify = plainSlug) {
  const owned = ownedLores(actorItems, sluggify);
  const create = [];
  const updates = [];
  for (const lore of listOf(lores)) {
    const rank = wholeRank(lore.rank);
    const current = owned.get(loreKey(lore.name, sluggify));
    if (current === undefined) create.push(newLore(lore, rank));
    else if (current.rank < rank) updates.push({ _id: current.id, "system.proficient.value": rank });
  }
  return { create, updates };
}

function newLore(lore, rank) {
  return withBuildFlag({ name: lore.name, type: "lore", system: { proficient: { value: rank } } }, { key: lore.key });
}

function ownedLores(actorItems, sluggify) {
  const owned = new Map();
  for (const item of actorItems ?? []) {
    if (item?.type !== "lore") continue;
    const key = loreKey(item.name, sluggify);
    if (owned.has(key)) continue;
    owned.set(key, { id: item.id ?? item._id, rank: wholeRank(item.system?.proficient?.value) });
  }
  return owned;
}

/** pf2e's lore statistic key: the name's slug, plus "-lore" unless a word of it already is "lore". */
function loreKey(name, sluggify) {
  const slug = sluggify(String(name ?? "").trim());
  if (slug.split("-").includes("lore")) return slug;
  return `${slug}-lore`;
}

function plainSlug(text) {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "");
}

function wholeRank(value) {
  return Number.isFinite(value) ? Math.trunc(value) : 0;
}
