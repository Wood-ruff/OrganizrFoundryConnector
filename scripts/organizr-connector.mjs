import { OrganizrSidebarTab } from "./entry/OrganizrSidebarTab.mjs";

const TAB_ID = OrganizrSidebarTab.tabName;

const COMBAT_HOOKS = [
  "createCombat", "updateCombat", "deleteCombat",
  "createCombatant", "updateCombatant", "deleteCombatant",
  "combatTurnChange", "canvasReady"
];

Hooks.once("init", registerSidebarTab);
Hooks.once("ready", () => {
  for (const hook of COMBAT_HOOKS) Hooks.on(hook, rerenderTab);
});

function registerSidebarTab() {
  CONFIG.ui[TAB_ID] = OrganizrSidebarTab;
  CONFIG.ui.sidebar.TABS = tabsWithOrganizrBeforeSettings(CONFIG.ui.sidebar.TABS);
}

function tabsWithOrganizrBeforeSettings(tabs) {
  const descriptor = { tooltip: "ORGANIZR.Tab.Title", icon: "fa-solid fa-book-open-reader" };
  const result = {};
  for (const [id, config] of Object.entries(tabs)) {
    if (id === "settings") result[TAB_ID] = descriptor;
    result[id] = config;
  }
  if (!result[TAB_ID]) result[TAB_ID] = descriptor;
  return result;
}

function rerenderTab() {
  const tab = ui[TAB_ID];
  if (!tab?.rendered) return;
  tab.render();
  tab.popout?.render();
}
