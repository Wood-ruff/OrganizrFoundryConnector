import { combatOverview } from "../service/CombatOverview.mjs";
import { isWorldLinked, maskToken, normalizeWorldLink } from "../service/WorldLink.mjs";
import { isCollapsed, toggleSection } from "../service/SectionState.mjs";
import { readCollapsedSections, readWorldLink, writeCollapsedSections, writeWorldLink } from "../config/ModuleSettings.mjs";
import { CombatantInspector } from "./CombatantInspector.mjs";

const { AbstractSidebarTab } = foundry.applications.sidebar;
const { HandlebarsApplicationMixin } = foundry.applications.api;

/** Sidebar tab hosting the Organizr tools: combat overview and the per-world link settings. */
export class OrganizrSidebarTab extends HandlebarsApplicationMixin(AbstractSidebarTab) {
  static tabName = "organizr";

  static DEFAULT_OPTIONS = {
    window: { title: "ORGANIZR.Tab.Title" },
    actions: {
      toggleSection: OrganizrSidebarTab.#onToggleSection,
      inspectCombatant: OrganizrSidebarTab.#onInspectCombatant,
      saveWorldLink: OrganizrSidebarTab.#onSaveWorldLink,
      clearWorldLink: OrganizrSidebarTab.#onClearWorldLink
    }
  };

  static PARTS = {
    combat: { template: "modules/organizr-foundry-connector/templates/combat-section.hbs" },
    settings: { template: "modules/organizr-foundry-connector/templates/settings-section.hbs" }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const collapsed = readCollapsedSections();
    context.isGM = game.user.isGM;
    context.combat = combatOverview(game.combat, game.user);
    context.combatCollapsed = isCollapsed(collapsed, "combat");
    context.settingsCollapsed = isCollapsed(collapsed, "settings");
    context.link = linkContext(readWorldLink());
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
