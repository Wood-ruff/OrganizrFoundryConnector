const DND5E_SYSTEM_ID = "dnd5e";
const PF2E_SYSTEM_ID = "pf2e";
const CHARACTER_TYPE = "character";
const BODY_KEYS = new Map([["loot", "LootBody"], ["npc", "ActorBody"], ["character", "CharacterBody"]]);
const ITEM_BODY_KEY = "ORGANIZR.Refresh.ItemBody";

/**
 * What the confirm dialog of a single refresh says: body and restore texts by sheet kind and world system (dnd5e has
 * its own, a pf2e character is rebuilt from its recipe), the restore box for loot and pf2e characters.
 */
export function refreshPrompt(name, sheetType, systemId = "") {
  if (rebuildsPf2eCharacter(sheetType, systemId)) {
    return { name, bodyKey: pf2eKey("CharacterBody"), restoreKey: pf2eKey("RestoreInventory"), showRestore: true };
  }
  return {
    name,
    bodyKey: refreshBodyKey(sheetType, systemId),
    restoreKey: refreshKey("RestoreInventory", systemId),
    showRestore: sheetType === "loot"
  };
}

function rebuildsPf2eCharacter(sheetType, systemId) {
  return sheetType === CHARACTER_TYPE && systemId === PF2E_SYSTEM_ID;
}

function pf2eKey(name) {
  return `ORGANIZR.Refresh.Pf2e.${name}`;
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
 * items; in a pf2e world they are rebuilt and keep their play state, with their own keeps text and restore box); the
 * loot restore box only when linked loot would be skipped.
 */
export function batchPrompt(plan, systemId = "") {
  const rebuilt = rebuiltCharacterCount(plan, systemId);
  return {
    create: plan.create.length,
    refresh: plan.refresh.length,
    characters: plan.refresh.filter((sheet) => sheet.type === CHARACTER_TYPE).length,
    skipped: plan.skippedLoot.length,
    showRestore: plan.skippedLoot.length > 0,
    showCharacterRestore: rebuilt > 0,
    keepsKey: batchKeepsKey(systemId),
    charactersKey: batchCharactersKey(systemId),
    skippedKey: refreshKey("BatchSkipped", systemId),
    restoreKey: refreshKey("BatchRestore", systemId),
    characterRestoreKey: pf2eKey("BatchRestoreCharacters")
  };
}

/**
 * What the batch dialog's answer restores: the skipped loot only when some was skipped, the pf2e characters rebuilt
 * from their recipe when their box was ticked.
 */
export function batchRestore(answer, plan) {
  return {
    inventory: Boolean(answer?.restoreInventory) && plan.skippedLoot.length > 0,
    characters: Boolean(answer?.restoreCharacters)
  };
}

/** The import options of one sheet of an "Import all": a character rebuilt from its recipe reads the characters' box. */
export function batchImportOptions(sheet, restore) {
  const restoreInventory = sheet.buildsFromRecipe ? restore.characters : restore.inventory;
  return { recordedUuid: sheet.uuid ?? null, restoreInventory };
}

function rebuiltCharacterCount(plan, systemId) {
  if (systemId !== PF2E_SYSTEM_ID) return 0;
  return plan.refresh.filter((sheet) => sheet.buildsFromRecipe === true).length;
}

function batchKeepsKey(systemId) {
  if (systemId === PF2E_SYSTEM_ID) return pf2eKey("BatchKeeps");
  return refreshKey("BatchKeeps", systemId);
}

function batchCharactersKey(systemId) {
  if (systemId === PF2E_SYSTEM_ID) return pf2eKey("BatchCharacters");
  return refreshKey("BatchCharacters", systemId);
}
