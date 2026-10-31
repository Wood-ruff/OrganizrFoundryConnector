import { combatOverview } from "../service/CombatOverview.mjs";
import { characterRows } from "../service/CharacterList.mjs";
import { syncBody, syncErrorKey, syncFlag, syncOutcome } from "../service/CharacterSync.mjs";
import { isWorldLinked, normalizeWorldLink } from "../service/WorldLink.mjs";
import { isCollapsed, toggleSection, visibleSectionParts } from "../service/SectionState.mjs";
import {
  MODULE_ID, readAutoSendCombat, readCombatSync, readCollapsedSections, readWorldLink,
  writeAutoSendCombat, writeCollapsedSections, writeCombatSync, writeWorldLink
} from "../config/ModuleSettings.mjs";
import { userRows, worldInfo } from "../config/WorldInfo.mjs";
import { createOrganizrClient } from "../client/OrganizrClient.mjs";
import { CombatantInspector } from "./CombatantInspector.mjs";
import { CombatPayloadPreview } from "./CombatPayloadPreview.mjs";
import { CharacterExportPreview } from "./CharacterExportPreview.mjs";
import { SheetBrowser } from "./SheetBrowser.mjs";
import { sendCombat } from "./CombatSync.mjs";

const { AbstractSidebarTab } = foundry.applications.sidebar;
const { HandlebarsApplicationMixin } = foundry.applications.api;

const organizr = createOrganizrClient();

/** Sidebar tab hosting the Organizr tools: combat overview, player characters and the per-world link. */
export class OrganizrSidebarTab extends HandlebarsApplicationMixin(AbstractSidebarTab) {
  static tabName = "organizr";

  static DEFAULT_OPTIONS = {
    window: { title: "ORGANIZR.Tab.Title" },
    actions: {
      toggleSection: OrganizrSidebarTab.#onToggleSection,
      inspectCombatant: OrganizrSidebarTab.#onInspectCombatant,
      previewCombat: OrganizrSidebarTab.#onPreviewCombat,
      sendCombat: OrganizrSidebarTab.#onSendCombat,
      previewCharacter: OrganizrSidebarTab.#onPreviewCharacter,
      syncCharacter: OrganizrSidebarTab.#onSyncCharacter,
      openSheetBrowser: OrganizrSidebarTab.#onOpenSheetBrowser,
      saveWorldLink: OrganizrSidebarTab.#onSaveWorldLink,
      clearWorldLink: OrganizrSidebarTab.#onClearWorldLink
    }
  };

  static PARTS = {
    combat: { template: "modules/organizr-foundry-connector/templates/combat-section.hbs" },
    characters: { template: "modules/organizr-foundry-connector/templates/characters-section.hbs" },
    sync: { template: "modules/organizr-foundry-connector/templates/sync-section.hbs" },
    settings: { template: "modules/organizr-foundry-connector/templates/settings-section.hbs" }
  };

  _configureRenderParts(options) {
    return visibleSectionParts(super._configureRenderParts(options), game.user.isGM);
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const collapsed = readCollapsedSections();
    const link = readWorldLink();
    context.isGM = game.user.isGM;
    context.combat = combatOverview(game.combat, game.user);
    context.characters = characterRows(game.actors.contents, userRows());
    context.linked = isWorldLinked(link);
    context.canSendCombat = context.linked && readCombatSync();
    context.combatCollapsed = isCollapsed(collapsed, "combat");
    context.charactersCollapsed = isCollapsed(collapsed, "characters");
    context.syncCollapsed = isCollapsed(collapsed, "sync");
    context.settingsCollapsed = isCollapsed(collapsed, "settings");
    context.link = linkContext(link);
    return context;
  }

  static async #onToggleSection(event, target) {
    const next = toggleSection(readCollapsedSections(), target.dataset.section);
    await writeCollapsedSections(next);
    this.render();
  }

  static #onPreviewCombat() {
    if (game.combat) CombatPayloadPreview.show(game.combat);
  }

  static async #onSendCombat(event, target) {
    if (!game.combat || !game.user.isGM || !readCombatSync()) return;
    target.disabled = true;
    try {
      await sendCombat(game.combat, { type: "manual", direction: 0 });
    } finally {
      target.disabled = false;
    }
  }

  static #onInspectCombatant(event, target) {
    const combatant = game.combat?.combatants.get(target.dataset.combatantId);
    if (combatant) CombatantInspector.show(combatant);
  }

  static #onPreviewCharacter(event, target) {
    const actor = game.actors.get(target.dataset.actorId);
    if (actor) CharacterExportPreview.show(actor);
  }

  static async #onSyncCharacter(event, target) {
    const actor = game.actors.get(target.dataset.actorId);
    const link = readWorldLink();
    if (!actor || !game.user.isGM) return;
    if (!isWorldLinked(link)) {
      ui.notifications.warn(game.i18n.localize("ORGANIZR.Characters.Errors.NotLinked"));
      return;
    }
    target.disabled = true;
    try {
      await pushCharacter(actor, link);
    } finally {
      this.render({ parts: ["characters"] });
    }
  }

  static #onOpenSheetBrowser() {
    if (!game.user.isGM) return;
    if (!isWorldLinked(readWorldLink())) {
      ui.notifications.warn(game.i18n.localize("ORGANIZR.Characters.Errors.NotLinked"));
      return;
    }
    SheetBrowser.show();
  }

  static async #onSaveWorldLink(event, target) {
    const form = target.closest("form");
    const input = new foundry.applications.ux.FormDataExtended(form).object;
    const { link, errors } = normalizeWorldLink(input, readWorldLink().apiToken);
    if (errors.length) {
      for (const error of errors) ui.notifications.warn(game.i18n.localize(error));
      return;
    }
    await writeWorldLink(link);
    await writeAutoSendCombat(input.autoSendCombat);
    await writeCombatSync(input.combatSync);
    ui.notifications.info(game.i18n.localize("ORGANIZR.Settings.Saved"));
    this.render();
  }

  static async #onClearWorldLink() {
    await writeWorldLink({ serverUrl: "", apiToken: "", projectId: "" });
    this.render();
  }
}

async function pushCharacter(actor, link) {
  let result;
  try {
    result = await organizr.pushCharacter(link, syncBody(actor, worldInfo(), (key) => game.i18n.localize(key)));
  } catch (error) {
    const key = syncErrorKey(error.status ?? -1);
    ui.notifications.error(key, { localize: true, format: { name: actor.name, message: error.message } });
    return;
  }
  await actor.setFlag(MODULE_ID, "sync", syncFlag(result, link, new Date().toISOString()));
  const outcome = syncOutcome(result);
  ui.notifications.info(outcome.key, { localize: true, format: { name: actor.name, ...outcome.data } });
  for (const note of outcome.notes) {
    ui.notifications.warn("ORGANIZR.Characters.SyncNote", { localize: true, format: { name: actor.name, note } });
  }
}

function linkContext(link) {
  return {
    serverUrl: link.serverUrl,
    projectId: link.projectId,
    hasToken: Boolean(link.apiToken),
    linked: isWorldLinked(link),
    autoSendCombat: readAutoSendCombat(),
    combatSync: readCombatSync(),
    worldTitle: game.world.title
  };
}
