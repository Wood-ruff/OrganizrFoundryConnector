/**
 * A lookup from an incoming item to the current item it replaces: the same `_id` with the same type and name, else a
 * type and name that is unique on both sides (the export numbers ids by position, a document made in Foundry has its
 * own ids). Returns null when nothing matches.
 */
export function currentItemMatcher(items, currentItems) {
  const currentById = new Map((currentItems ?? []).map((item) => [item._id, item]));
  const currentByName = uniqueByTypeAndName(currentItems);
  const incomingByName = uniqueByTypeAndName(items);
  return (item) => matchingCurrentItem(item, currentById, currentByName, incomingByName);
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
