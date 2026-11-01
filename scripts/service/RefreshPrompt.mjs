const DND5E_SYSTEM_ID = "dnd5e";
const BODY_KEYS = new Map([["loot", "LootBody"], ["npc", "ActorBody"], ["character", "CharacterBody"]]);
const ITEM_BODY_KEY = "ORGANIZR.Refresh.ItemBody";

/**
 * What the confirm dialog of a single refresh says: body and restore texts by sheet kind and world system (dnd5e has
 * its own), the restore box only for loot.
 */
export function refreshPrompt(name, sheetType, systemId = "") {
  return {
    name,
    bodyKey: refreshBodyKey(sheetType, systemId),
    restoreKey: refreshKey("RestoreInventory", systemId),
    showRestore: sheetType === "loot"
  };
}

function refreshBodyKey(sheetType, systemId) {
  const bodyKey = BODY_KEYS.get(sheetType);
  if (!bodyKey) return ITEM_BODY_KEY;
  return refreshKey(bodyKey, systemId);
}

/** The localization key of a refresh text; a dnd5e world reads the dnd5e variant. */
function refreshKey(name, systemId) {
  if (systemId === DND5E_SYSTEM_ID) return `ORGANIZR.Refresh.Dnd5e.${name}`;
  return `ORGANIZR.Refresh.${name}`;
}

/** Whether "Import all" asks first: some copies would be refreshed or some linked loot is skipped. */
export function needsBatchConfirm(plan) {
  return plan.refresh.length > 0 || plan.skippedLoot.length > 0;
}

/**
 * The counts and texts the batch confirm dialog shows, including the refreshed characters (they take Organizr's
 * items); the restore box only when linked loot would be skipped.
 */
export function batchPrompt(plan, systemId = "") {
  return {
    create: plan.create.length,
    refresh: plan.refresh.length,
    characters: plan.refresh.filter((sheet) => sheet.type === "character").length,
    skipped: plan.skippedLoot.length,
    showRestore: plan.skippedLoot.length > 0,
    keepsKey: refreshKey("BatchKeeps", systemId),
    charactersKey: refreshKey("BatchCharacters", systemId),
    restoreKey: refreshKey("RestoreInventory", systemId)
  };
}
