import { combatantSnapshot, snapshotJson } from "../service/CombatantSnapshot.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const LIVE_HOOKS = ["updateActor", "updateToken", "updateCombatant", "updateActiveEffect", "updateItem"];

/** Floating window showing the live JSON of one combatant; re-renders when its documents change. */
export class CombatantInspector extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: ["organizr-inspector"],
    window: { title: "ORGANIZR.Inspector.Title", resizable: true },
    position: { width: 620, height: 720 },
    actions: {
      copyJson: CombatantInspector.#onCopyJson
    }
  };

  static PARTS = {
    body: { template: "modules/organizr-foundry-connector/templates/combatant-inspector.hbs" }
  };

  static #open = new Map();

  #combatId;
  #combatantId;
  #hookIds = [];

  constructor({ combatId, combatantId, ...options } = {}) {
    super({ id: `organizr-inspector-${combatantId}`, ...options });
    this.#combatId = combatId;
    this.#combatantId = combatantId;
  }

  /** Opens (or focuses) the inspector for a combatant. */
  static show(combatant) {
    const existing = CombatantInspector.#open.get(combatant.id);
    if (existing) return existing.render({ force: true });
    const inspector = new CombatantInspector({ combatId: combatant.parent.id, combatantId: combatant.id });
    CombatantInspector.#open.set(combatant.id, inspector);
    return inspector.render({ force: true });
  }

  get combatant() {
    return game.combats.get(this.#combatId)?.combatants.get(this.#combatantId) ?? null;
  }

  get title() {
    const name = this.combatant?.name ?? "?";
    return `${game.i18n.localize("ORGANIZR.Inspector.Title")}: ${name}`;
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const combatant = this.combatant;
    context.missing = combatant === null;
    context.json = combatant ? snapshotJson(combatantSnapshot(combatant)) : "";
    return context;
  }

  _onFirstRender(context, options) {
    super._onFirstRender(context, options);
    for (const hook of LIVE_HOOKS) {
      this.#hookIds.push([hook, Hooks.on(hook, (document) => this.#onDocumentChange(document))]);
    }
    this.#hookIds.push(["deleteCombatant", Hooks.on("deleteCombatant", (document) => {
      if (document.id === this.#combatantId) this.render();
    })]);
  }

  _onClose(options) {
    super._onClose(options);
    for (const [hook, id] of this.#hookIds) Hooks.off(hook, id);
    this.#hookIds = [];
    CombatantInspector.#open.delete(this.#combatantId);
  }

  #onDocumentChange(document) {
    if (this.#concerns(document)) this.render();
  }

  #concerns(document) {
    const combatant = this.combatant;
    if (!combatant) return false;
    if (document === combatant) return true;
    const actor = combatant.actor;
    const token = combatant.token;
    if (document === actor || document === token) return true;
    const parent = document.parent;
    return parent === actor || parent === token;
  }

  static async #onCopyJson() {
    const combatant = this.combatant;
    if (!combatant) return;
    await game.clipboard.copyPlainText(snapshotJson(combatantSnapshot(combatant)));
    ui.notifications.info(game.i18n.localize("ORGANIZR.Inspector.Copied"));
  }
}
