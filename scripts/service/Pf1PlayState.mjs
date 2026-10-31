const PF1_SYSTEM_ID = "pf1";
const KEPT_RESOURCE_KEYS = { hp: ["offset", "nonlethal", "temp"], wounds: ["offset"], vigor: ["offset", "temp"] };
const CONTAINER_TYPE = "container";
const CONTAINER_INVENTORY_KEYS = ["items", "currency"];

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

/** Each spellbook the export still has keeps the remaining casts per spell level (`spells.spellN.value`). */
export function keepPf1SpellbookSlots(result, current) {
  const currentBooks = current.system?.attributes?.spells?.spellbooks ?? {};
  const resultBooks = result.system?.attributes?.spells?.spellbooks ?? {};
  for (const [bookId, book] of Object.entries(resultBooks)) {
    const currentLevels = currentBooks[bookId]?.spells ?? {};
    for (const [levelKey, level] of Object.entries(book?.spells ?? {})) {
      const currentValue = currentLevels[levelKey]?.value;
      if (level && typeof currentValue === "number") level.value = currentValue;
    }
  }
}

/** Items present in both (same `_id`) keep their remaining uses and prepared casts, casts up to the new maximum. */
export function keepPf1ItemUses(items, currentItems) {
  const currentById = new Map((currentItems ?? []).map((item) => [item._id, item]));
  for (const item of items) {
    const currentItem = currentById.get(item._id);
    if (!currentItem) continue;
    keepUses(item.system?.uses, currentItem.system?.uses);
    keepPreparation(item.system?.preparation, currentItem.system?.preparation);
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

function keepUses(uses, currentUses) {
  if (!uses || typeof currentUses?.value !== "number") return;
  uses.value = currentUses.value;
}

function keepPreparation(preparation, currentPreparation) {
  if (!preparation || typeof currentPreparation?.value !== "number") return;
  const max = preparation.max;
  preparation.value = typeof max === "number" ? Math.min(currentPreparation.value, max) : currentPreparation.value;
}
