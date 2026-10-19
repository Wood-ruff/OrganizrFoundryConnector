import { OrganizrSidebarTab } from "./entry/OrganizrSidebarTab.mjs";
import { isActiveGM, isSyncedCombat, queueState, sendCombat, sendEnd, sendMove } from "./entry/CombatSync.mjs";
import { combatEvent, combatantOfActor, isStatusDocument } from "./service/CombatPayload.mjs";
import { isWorldLinked } from "./service/WorldLink.mjs";
import { startCommandPolling } from "./entry/CombatCommandPoller.mjs";
import { readAutoSendCombat, readCombatSync, readWorldLink, registerModuleSettings } from "./config/ModuleSettings.mjs";

const TAB_ID = OrganizrSidebarTab.tabName;

const COMBAT_HOOKS = [
  "createCombat", "updateCombat", "deleteCombat",
  "createCombatant", "updateCombatant", "deleteCombatant",
  "combatTurnChange", "canvasReady"
];

const STATUS_HOOKS = [
  "createActiveEffect", "updateActiveEffect", "deleteActiveEffect",
  "createItem", "updateItem", "deleteItem"
];

const CHARACTER_LIST_FIELDS = ["name", "img", "ownership", "type"];

Hooks.once("init", () => {
  registerModuleSettings();
  registerSidebarTab();
});

Hooks.once("ready", () => {
  for (const hook of COMBAT_HOOKS) Hooks.on(hook, () => rerenderPart("combat"));
  Hooks.on("combatTurnChange", (combat, prior, current) => {
    const event = combatEvent(prior, current);
    if (event.type === "start") {
      if (shouldAutoSend() && !isSyncedCombat(combat)) sendCombat(combat, event);
    } else if (shouldFollow(combat)) {
      sendMove(combat, event);
    }
  });
  Hooks.on("deleteCombat", (combat) => {
    if (shouldFollow(combat)) sendEnd();
  });
  for (const hook of STATUS_HOOKS) Hooks.on(hook, (document) => onActorStateChange(actorOf(document), document));
  Hooks.on("updateActor", (actor) => onActorStateChange(actor));
  Hooks.on("updateToken", (token, changes) => {
    if ("delta" in changes) onActorStateChange(token.actor);
  });
  Hooks.on("updateCombatant", (combatant) => {
    if (shouldFollow(combatant.parent)) queueState(combatant.parent, combatant);
  });
  startCommandPolling(() => shouldFollow(game.combat));
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

function shouldAutoSend() {
  return readCombatSync() && readAutoSendCombat() && isActiveGM() && isWorldLinked(readWorldLink());
}

function shouldFollow(combat) {
  return Boolean(combat) && readCombatSync() && isActiveGM() && isSyncedCombat(combat);
}

function actorOf(embedded) {
  const parent = embedded.parent ?? null;
  return parent?.documentName === "Item" ? parent.actor ?? null : parent;
}

function onActorStateChange(actor, changed = null) {
  if (changed && !isStatusDocument(changed.documentName, changed.type)) return;
  const combat = game.combat;
  if (!actor || !shouldFollow(combat)) return;
  const combatant = combatantOfActor(combat.combatants, actor);
  if (combatant) queueState(combat, combatant);
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
