import { combatOverview } from "../service/CombatOverview.mjs";

const { AbstractSidebarTab } = foundry.applications.sidebar;
const { HandlebarsApplicationMixin } = foundry.applications.api;

/** Sidebar tab hosting the Organizr tools; currently shows the running combat. */
export class OrganizrSidebarTab extends HandlebarsApplicationMixin(AbstractSidebarTab) {
  static tabName = "organizr";

  static DEFAULT_OPTIONS = {
    window: { title: "ORGANIZR.Tab.Title" }
  };

  static PARTS = {
    combat: { template: "modules/organizr-foundry-connector/templates/combat-section.hbs" }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.combat = combatOverview(game.combat, game.user);
    return context;
  }
}
