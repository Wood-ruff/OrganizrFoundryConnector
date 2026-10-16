import { combatOverview } from "../service/CombatOverview.mjs";
import { characterRows } from "../service/CharacterList.mjs";
import { isWorldLinked, maskToken, normalizeWorldLink } from "../service/WorldLink.mjs";
import { isCollapsed, toggleSection } from "../service/SectionState.mjs";
import { readCollapsedSections, readWorldLink, writeCollapsedSections, writeWorldLink } from "../config/ModuleSettings.mjs";
import { userRows } from "../config/WorldInfo.mjs";
import { CombatantInspector } from "./CombatantInspector.mjs";
import { CharacterExportPreview } from "./CharacterExportPreview.mjs";

const { AbstractSidebarTab } = foundry.applications.sidebar;
const { HandlebarsApplicationMixin } = foundry.applications.api;

/** Sidebar tab hosting the Organizr tools: combat overview, player characters and the per-world link. */
export class OrganizrSidebarTab extends HandlebarsApplicationMixin(AbstractSidebarTab) {
  static tabName = "organizr";

  static DEFAULT_OPTIONS = {
    window: { title: "ORGANIZR.Tab.Title" },
    actions: {
      toggleSection: OrganizrSidebarTab.#onToggleSection,
      inspectCombatant: OrganizrSidebarTab.#onInspectCombatant,
      previewCharacter: OrganizrSidebarTab.#onPreviewCharacter,
      syncCharacter: OrganizrSidebarTab.#onSyncCharacter,
      saveWorldLink: OrganizrSidebarTab.#onSaveWorldLink,
      clearWorldLink: OrganizrSidebarTab.#onClearWorldLink
    }
  };

  static PARTS = {
    combat: { template: "modules/organizr-foundry-connector/templates/combat-section.hbs" },
    characters: { template: "modules/organizr-foundry-connector/templates/characters-section.hbs" },
    settings: { template: "modules/organizr-foundry-connector/templates/settings-section.hbs" }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const collapsed = readCollapsedSections();
    const link = readWorldLink();
    context.isGM = game.user.isGM;
    context.combat = combatOverview(game.combat, game.user);
    context.characters = characterRows(game.actors.contents, userRows());
    context.combatCollapsed = isCollapsed(collapsed, "combat");
    context.charactersCollapsed = isCollapsed(collapsed, "characters");
    context.settingsCollapsed = isCollapsed(collapsed, "settings");
    context.link = linkContext(link);
    return context;
  }

  static async #onToggleSection(event, target) {
    const next = toggleSection(readCollapsedSections(), target.dataset.section);
    await writeCollapsedSections(next);
    this.render();
  }

  static #onInspectCombatant(event, target) {
    const combatant = game.combat?.combatants.get(target.dataset.combatantId);
    if (combatant) CombatantInspector.show(combatant);
  }

  static #onPreviewCharacter(event, target) {
    const actor = game.actors.get(target.dataset.actorId);
    if (actor) CharacterExportPreview.show(actor);
  }

  static #onSyncCharacter(event, target) {
    const actor = game.actors.get(target.dataset.actorId);
    if (!actor) return;
    ui.notifications.warn(game.i18n.localize("ORGANIZR.Characters.SyncNotWired"));
    CharacterExportPreview.show(actor);
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
    ui.notifications.info(game.i18n.localize("ORGANIZR.Settings.Saved"));
    this.render();
  }

  static async #onClearWorldLink() {
    await writeWorldLink({ serverUrl: "", apiToken: "", projectId: "" });
    this.render();
  }
}

function linkContext(link) {
  return {
    serverUrl: link.serverUrl,
    projectId: link.projectId,
    hasToken: Boolean(link.apiToken),
    maskedToken: maskToken(link.apiToken),
    linked: isWorldLinked(link),
    worldTitle: game.world.title
  };
}
