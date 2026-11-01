import { MODULE_ID } from "../config/ModuleId.mjs";
import { buildKeyOf, buildOwnerOf } from "./Pf2eItemSources.mjs";
import { listOf } from "../util/ObjectLists.mjs";
import { IDENTITY_KINDS, isCoinItem } from "./Pf2eItemTypes.mjs";

const KEPT_TYPES_WITHOUT_BUILD = ["condition", "effect", "affliction"];

/** Whether the connector built this actor (`flags[MODULE].build`). */
export function isBuiltActor(actorSource) {
  const build = actorSource?.flags?.[MODULE_ID]?.build;
  return build !== null && typeof build === "object";
}

/** The id of the actor's build (`flags[MODULE].build.id`), or null (not built, or built before builds had an id). */
export function actorBuildId(actorSource) {
  const id = actorSource?.flags?.[MODULE_ID]?.build?.id;
  return typeof id === "string" && id !== "" ? id : null;
}

/**
 * The build's own roots by build key: the first item per key whose build flag names this actor's build (no owner when
 * the actor's build has no id). An item another build made (traded in) or a second item with the same key (a split
 * stack, a duplicate) belongs to Foundry. Empty for an actor the connector did not build.
 */
export function ownRoots(actorSource) {
  const roots = new Map();
  if (!isBuiltActor(actorSource)) return roots;
  const buildId = actorBuildId(actorSource);
  for (const item of itemsOf(actorSource)) {
    const key = buildKeyOf(item);
    if (key === null || roots.has(key) || buildOwnerOf(item) !== buildId) continue;
    roots.set(key, item);
  }
  return roots;
}

/**
 * The ids of the items a rebuild deletes, in item order: on a built actor its own roots, every item those grant (any
 * `onDelete` kind) and every item placed in a deleted ancestry, heritage, background, class or deity, repeated until
 * nothing is added; on any other actor every item except conditions, effects and afflictions. Coin items are all kept
 * with `keepCoins`, else all deleted (Organizr's coins replace them).
 */
export function rootIdsToDelete(actorSource, { keepCoins = false } = {}) {
  const items = itemsOf(actorSource);
  const deleted = isBuiltActor(actorSource) ? builtDeletes(actorSource, items) : unbuiltDeletes(items);
  for (const coin of items.filter(isCoinItem)) {
    if (keepCoins) deleted.delete(coin._id);
    else deleted.add(coin._id);
  }
  return items.filter((item) => deleted.has(item._id)).map((item) => item._id);
}

/**
 * The updates that clear the build flag of every kept item that carries a build key without being one of the build's
 * own roots (a split-off stack, a duplicate, an item traded in from another build), so it stays a Foundry item for
 * good and the next rebuild finds the same roots.
 */
export function strayKeyUpdates(actorSource, { keepCoins = false } = {}) {
  const roots = new Set([...ownRoots(actorSource).values()].map((item) => item._id));
  const deleted = new Set(rootIdsToDelete(actorSource, { keepCoins }));
  return itemsOf(actorSource)
    .filter((item) => buildKeyOf(item) !== null && !roots.has(item._id) && !deleted.has(item._id))
    .map((item) => ({ _id: item._id, [`flags.${MODULE_ID}.build`]: null }));
}

function unbuiltDeletes(items) {
  return new Set(items.filter((item) => !KEPT_TYPES_WITHOUT_BUILD.includes(item.type)).map((item) => item._id));
}

function builtDeletes(actorSource, items) {
  const deleted = new Set([...ownRoots(actorSource).values()].map((item) => item._id));
  const parents = grantParents(items);
  const abcIds = new Set(items.filter((item) => IDENTITY_KINDS.includes(item.type)).map((item) => item._id));
  let grown = true;
  while (grown) {
    grown = false;
    for (const item of items) {
      if (deleted.has(item._id) || !belongsToDeleted(item, deleted, parents, abcIds)) continue;
      deleted.add(item._id);
      grown = true;
    }
  }
  return deleted;
}

/** Granted id → granter ids, read from both sides of pf2e's grant link (`itemGrants` and `grantedBy`). */
function grantParents(items) {
  const parents = new Map();
  const link = (parentId, childId) => {
    if (!parents.has(childId)) parents.set(childId, new Set());
    parents.get(childId).add(parentId);
  };
  for (const item of items) {
    for (const grant of Object.values(item.flags?.pf2e?.itemGrants ?? {})) {
      if (typeof grant?.id === "string") link(item._id, grant.id);
    }
    const granter = item.flags?.pf2e?.grantedBy?.id;
    if (typeof granter === "string") link(granter, item._id);
  }
  return parents;
}

function belongsToDeleted(item, deleted, parents, abcIds) {
  const granters = parents.get(item._id) ?? new Set();
  if ([...granters].some((parentId) => deleted.has(parentId))) return true;
  const location = item.system?.location;
  return abcIds.has(location) && deleted.has(location);
}

function itemsOf(actorSource) {
  return listOf(actorSource?.items);
}
