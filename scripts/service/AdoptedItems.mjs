import { MODULE_ID } from "../config/ModuleId.mjs";
import { buildKeyOf, buildOwnerOf } from "./Pf2eItemSources.mjs";
import { listOf } from "../util/ObjectLists.mjs";

/**
 * The actor items a build takes over instead of creating a copy (`[{key, id}]`, recipe order): for each feature,
 * action, spell and inventory entry the build writes (a planned source, gear not skipped) whose linked sheet was
 * pushed from an item the actor holds (`foundryItemId`) that is no item of this build. An item named by an earlier
 * entry is taken once.
 */
export function adoptableItems(recipe, plan, actorItems) {
  const byId = itemsById(actorItems);
  const adopted = [];
  const taken = new Set();
  for (const entry of pushedEntries(recipe, plan)) {
    const item = byId.get(entry.foundryItemId);
    if (!item || taken.has(entry.foundryItemId) || isOwnItem(item, plan?.buildId)) continue;
    taken.add(entry.foundryItemId);
    adopted.push({ key: entry.key, id: entry.foundryItemId });
  }
  return adopted;
}

/** The item updates that make each adopted item a root of the build: its entry's key and the build as owner. */
export function adoptionUpdates(adopted, buildId) {
  return listOf(adopted).map(({ key, id }) => ({ _id: id, [`flags.${MODULE_ID}.build`]: { key, owner: buildId } }));
}

function pushedEntries(recipe, plan) {
  const spells = listOf(recipe?.spellcasting).flatMap((casting) => listOf(casting.spells));
  const gear = listOf(recipe?.inventory).filter((entry) => !skipsGear(plan, entry.key));
  const entries = [...listOf(recipe?.features), ...listOf(recipe?.actions), ...spells, ...gear];
  return entries.filter((entry) => hasItemId(entry) && plan?.sources?.has(entry.key));
}

function hasItemId(entry) {
  return typeof entry?.foundryItemId === "string" && entry.foundryItemId !== "";
}

function skipsGear(plan, key) {
  return typeof plan?.skipsGear === "function" && plan.skipsGear(key);
}

function isOwnItem(item, buildId) {
  return buildKeyOf(item) !== null && buildOwnerOf(item) === buildId;
}

function itemsById(actorItems) {
  const byId = new Map();
  for (const item of actorItems ?? []) {
    const id = item?.id ?? item?._id;
    if (typeof id === "string") byId.set(id, item);
  }
  return byId;
}
