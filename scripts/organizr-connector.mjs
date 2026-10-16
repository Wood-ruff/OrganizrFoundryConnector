import { OrganizrSidebarTab } from "./entry/OrganizrSidebarTab.mjs";
import { registerModuleSettings } from "./config/ModuleSettings.mjs";

const TAB_ID = OrganizrSidebarTab.tabName;

const COMBAT_HOOKS = [
  "createCombat", "updateCombat", "deleteCombat",
  "createCombatant", "updateCombatant", "deleteCombatant",
  "combatTurnChange", "canvasReady"
];

const CHARACTER_LIST_FIELDS = ["name", "img", "ownership", "type"];

Hooks.once("init", () => {
  registerModuleSettings();
  registerSidebarTab();
});

Hooks.once("ready", () => {
  for (const hook of COMBAT_HOOKS) Hooks.on(hook, () => rerenderPart("combat"));
  Hooks.on("createActor", () => rerenderPart("characters"));
  Hooks.on("deleteActor", () => rerenderPart("characters"));
  Hooks.on("updateActor", (actor, changes) => {
    if (touchesCharacterList(changes)) rerenderPart("characters");
  });
});

function registerSidebarTab() {
  CONFIG.ui[TAB_ID] = OrganizrSidebarTab;
  CONFIG.ui.sidebar.TABS = tabsWithOrganizrBeforeSettings(CONFIG.ui.sidebar.TABS);
}

function tabsWithOrganizrBeforeSettings(tabs) {
  const descriptor = { tooltip: "ORGANIZR.Tab.Title", icon: "fa-solid fa-book-open-reader", gmOnly: true };
  const result = {};
  for (const [id, config] of Object.entries(tabs)) {
    if (id === "settings") result[TAB_ID] = descriptor;
    result[id] = config;
  }
  if (!result[TAB_ID]) result[TAB_ID] = descriptor;
  return result;
}

function touchesCharacterList(changes) {
  return CHARACTER_LIST_FIELDS.some((field) => field in changes);
}

function rerenderPart(part) {
  const tab = ui[TAB_ID];
  if (!tab?.rendered) return;
  tab.render({ parts: [part] });
  tab.popout?.render({ parts: [part] });
}
