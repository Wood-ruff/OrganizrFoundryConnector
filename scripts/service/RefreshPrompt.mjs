/** What the confirm dialog of a single refresh says: body text by sheet kind, the restore box only for loot. */
export function refreshPrompt(name, sheetType) {
  return { name, bodyKey: refreshBodyKey(sheetType), showRestore: sheetType === "loot" };
}

function refreshBodyKey(sheetType) {
  if (sheetType === "loot") return "ORGANIZR.Refresh.LootBody";
  if (sheetType === "npc") return "ORGANIZR.Refresh.ActorBody";
  return "ORGANIZR.Refresh.ItemBody";
}

/** Whether "Import all" asks first: some copies would be refreshed or some linked loot is skipped. */
export function needsBatchConfirm(plan) {
  return plan.refresh.length > 0 || plan.skippedLoot.length > 0;
}

/** The counts the batch confirm dialog shows; the restore box only when linked loot would be skipped. */
export function batchPrompt(plan) {
  return {
    create: plan.create.length,
    refresh: plan.refresh.length,
    skipped: plan.skippedLoot.length,
    showRestore: plan.skippedLoot.length > 0
  };
}
