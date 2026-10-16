import { combatPayload } from "../service/CombatPayload.mjs";
import { worldInfo } from "../config/WorldInfo.mjs";
import { LiveJsonWindow } from "./LiveJsonWindow.mjs";

/** Live preview of the JSON the combat push sends for one combat. */
export class CombatPayloadPreview extends LiveJsonWindow {
  static DEFAULT_OPTIONS = {
    window: { title: "ORGANIZR.Combat.PreviewTitle" }
  };

  static LIVE_HOOKS = [
    "updateCombat", "createCombatant", "updateCombatant", "deleteCombatant",
    "updateActor", "updateToken", "createItem", "updateItem", "deleteItem",
    "createActiveEffect", "updateActiveEffect", "deleteActiveEffect"
  ];

  #combatId;

  constructor({ combatId, ...options }) {
    super(options);
    this.#combatId = combatId;
  }

  static show(combat) {
    return LiveJsonWindow.show(CombatPayloadPreview, {
      id: `organizr-combat-payload-${combat.id}`,
      combatId: combat.id
    });
  }

  _subject() {
    return game.combats.get(this.#combatId) ?? null;
  }

  _subjectTitle(combat) {
    return combat ? game.i18n.format("ORGANIZR.Combat.Round", { round: combat.round ?? 0 }) : "?";
  }

  _snapshot(combat) {
    return combatPayload(combat, worldInfo(), { type: "preview", direction: 0 });
  }

  _concerns() {
    return true;
  }
}
