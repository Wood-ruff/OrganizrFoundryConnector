const PF1_SYSTEM_ID = "pf1";
const KEPT_RESOURCE_KEYS = { hp: ["offset", "nonlethal", "temp"], wounds: ["offset"], vigor: ["offset", "temp"] };
const CONTAINER_TYPE = "container";
const CONTAINER_INVENTORY_KEYS = ["items", "currency"];
const BUFF_TYPE = "buff";
const EXPORTED_BUFF_ID_PREFIX = "organizrbuf";

/** Whether a document's source data comes from a pf1 world (`_stats.systemId`). */
export function isPf1Data(data) {
  return data?._stats?.systemId === PF1_SYSTEM_ID;
}

/**
 * Keeps the damage, nonlethal and temporary HP (plus wounds and vigor) of the current pf1 actor: every listed key the
 * current actor holds is written into the result, creating `system.attributes.<resource>` when the export has none.
 */
export function keepPf1Resources(result, current) {
  const currentAttributes = current.system?.attributes ?? {};
  for (const [resource, keys] of Object.entries(KEPT_RESOURCE_KEYS)) {
    const kept = presentKeys(currentAttributes[resource], keys);
    if (!Object.keys(kept).length) continue;
    const attributes = attributesOf(result);
    attributes[resource] = { ...(attributes[resource] ?? {}), ...kept };
  }
}

/**
 * Each spellbook the export still has under the same id and name keeps the remaining casts per spell level
 * (`spells.spellN.value`); the export numbers book ids by position, so a book whose id now names another takes none.
 */
export function keepPf1SpellbookSlots(result, current) {
  const currentBooks = current.system?.attributes?.spells?.spellbooks ?? {};
  const resultBooks = result.system?.attributes?.spells?.spellbooks ?? {};
  for (const [bookId, book] of Object.entries(resultBooks)) {
    const currentBook = currentBooks[bookId];
    if (currentBook?.name !== book?.name) continue;
    const currentLevels = currentBook?.spells ?? {};
    for (const [levelKey, level] of Object.entries(book?.spells ?? {})) {
      const currentValue = currentLevels[levelKey]?.value;
      if (level && typeof currentValue === "number") level.value = currentValue;
    }
  }
}

/**
 * Items present in both keep their remaining uses and prepared casts, each capped at the incoming count. An item
 * matches by `_id`, type and name, else by a type and name that is unique on both sides (the export numbers ids by
 * position, a character made in Foundry has its own ids).
 */
export function keepPf1ItemUses(items, currentItems) {
  const currentById = new Map((currentItems ?? []).map((item) => [item._id, item]));
  const currentByName = uniqueByTypeAndName(currentItems);
  const incomingByName = uniqueByTypeAndName(items);
  for (const item of items) {
    const currentItem = matchingCurrentItem(item, currentById, currentByName, incomingByName);
    if (!currentItem) continue;
    keepUses(item.system?.uses, currentItem.system?.uses);
    keepPreparation(item.system?.preparation, currentItem.system?.preparation);
  }
}

/**
 * Whether a current pf1 buff gives way to the export on a refresh: Organizr exported it (its id prefix), or the export
 * brings a buff of the same name back under Organizr's id.
 */
export function isReplacedPf1Buff(item, incomingItems) {
  if (item?.type !== BUFF_TYPE) return false;
  if (String(item._id ?? "").startsWith(EXPORTED_BUFF_ID_PREFIX)) return true;
  return (incomingItems ?? []).some((incoming) => incoming.type === BUFF_TYPE && incoming.name === item.name);
}

/**
 * A buff the export brings back keeps its current on/off state (`system.active`), matched like the uses: same `_id`,
 * type and name, else a type and name unique on both sides; Foundry-only buffs are kept whole elsewhere.
 */
export function keepPf1BuffStates(items, currentItems) {
  const currentById = new Map((currentItems ?? []).map((item) => [item._id, item]));
  const currentByName = uniqueByTypeAndName(currentItems);
  const incomingByName = uniqueByTypeAndName(items);
  for (const item of items) {
    if (item.type !== BUFF_TYPE) continue;
    const currentItem = matchingCurrentItem(item, currentById, currentByName, incomingByName);
    const currentActive = currentItem?.system?.active;
    if (typeof currentActive !== "boolean") continue;
    item.system = item.system ?? {};
    item.system.active = currentActive;
  }
}

/** A container item keeps its current contents and coins (`system.items`, `system.currency`). */
export function keepPf1ContainerInventory(result, current) {
  if (current?.type !== CONTAINER_TYPE || result.type !== CONTAINER_TYPE) return;
  for (const key of CONTAINER_INVENTORY_KEYS) {
    if (current.system?.[key] === undefined) continue;
    result.system = result.system ?? {};
    result.system[key] = structuredClone(current.system[key]);
  }
}

function presentKeys(source, keys) {
  const kept = {};
  for (const key of keys) {
    if (source?.[key] !== undefined) kept[key] = structuredClone(source[key]);
  }
  return kept;
}

function attributesOf(result) {
  result.system = result.system ?? {};
  result.system.attributes = result.system.attributes ?? {};
  return result.system.attributes;
}

function matchingCurrentItem(item, currentById, currentByName, incomingByName) {
  const sameId = currentById.get(item._id);
  if (isSameItem(sameId, item)) return sameId;
  const key = typeAndName(item);
  if (incomingByName.get(key) !== item) return null;
  return currentByName.get(key) ?? null;
}

/** Items by type and name; a type and name shared by two items maps to null. */
function uniqueByTypeAndName(items) {
  const byKey = new Map();
  for (const item of items ?? []) {
    const key = typeAndName(item);
    byKey.set(key, byKey.has(key) ? null : item);
  }
  return byKey;
}

function typeAndName(item) {
  return JSON.stringify([item?.type, item?.name]);
}

function isSameItem(currentItem, item) {
  if (!currentItem) return false;
  return currentItem.type === item.type && currentItem.name === item.name;
}

function keepUses(uses, currentUses) {
  if (!uses || typeof currentUses?.value !== "number") return;
  const incomingCount = uses.value;
  uses.value = typeof incomingCount === "number" ? Math.min(currentUses.value, incomingCount) : currentUses.value;
}

function keepPreparation(preparation, currentPreparation) {
  if (!preparation || typeof currentPreparation?.value !== "number") return;
  const max = preparation.max;
  preparation.value = typeof max === "number" ? Math.min(currentPreparation.value, max) : currentPreparation.value;
}
