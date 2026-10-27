import { batchPrompt, refreshPrompt } from "../service/RefreshPrompt.mjs";

const { DialogV2 } = foundry.applications.api;
const TEMPLATE = "modules/organizr-foundry-connector/templates/refresh-confirm.hbs";

/** Asks before refreshing one linked copy; resolves to { restoreInventory } or null when cancelled. */
export async function confirmRefresh(name, sheetType) {
  const prompt = refreshPrompt(name, sheetType);
  const content = await renderContent({ bodyKey: prompt.bodyKey, showRestore: prompt.showRestore });
  const title = game.i18n.format("ORGANIZR.Refresh.Title", { name });
  return askRefresh(title, content, "ORGANIZR.Refresh.Confirm");
}

/** Asks before an "Import all" that refreshes copies or skips linked loot; resolves to { restoreInventory } or null. */
export async function confirmBatch(plan) {
  const prompt = batchPrompt(plan);
  const content = await renderContent({ batch: prompt, showRestore: prompt.showRestore });
  return askRefresh(game.i18n.localize("ORGANIZR.Refresh.BatchTitle"), content, "ORGANIZR.Refresh.BatchConfirm");
}

function renderContent(context) {
  return foundry.applications.handlebars.renderTemplate(TEMPLATE, context);
}

async function askRefresh(title, content, confirmLabel) {
  const answer = await DialogV2.wait({
    window: { title, icon: "fa-solid fa-rotate" },
    classes: ["organizr-refresh-confirm"],
    content,
    buttons: [
      { action: "cancel", label: "ORGANIZR.Refresh.Cancel", icon: "fa-solid fa-xmark" },
      { action: "refresh", label: confirmLabel, icon: "fa-solid fa-rotate", default: true, callback: readAnswer }
    ],
    rejectClose: false
  });
  return answer && typeof answer === "object" ? answer : null;
}

function readAnswer(event, button) {
  return { restoreInventory: Boolean(button.form?.elements?.restoreInventory?.checked) };
}
