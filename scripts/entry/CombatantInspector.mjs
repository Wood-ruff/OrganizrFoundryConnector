import { combatantSnapshot } from "../service/CombatantSnapshot.mjs";
import { LiveJsonWindow } from "./LiveJsonWindow.mjs";

/** Live JSON of one combatant: combatant, token, actor source and derived actor data. */
export class CombatantInspector extends LiveJsonWindow {
  static DEFAULT_OPTIONS = {
    window: { title: "ORGANIZR.Inspector.Title" }
  };

  static LIVE_HOOKS = [
    "updateActor", "updateToken", "updateCombatant", "deleteCombatant",
    "updateActiveEffect", "updateItem"
  ];

  #combatId;
  #combatantId;

  constructor({ combatId, combatantId, ...options }) {
    super(options);
    this.#combatId = combatId;
    this.#combatantId = combatantId;
  }

  static show(combatant) {
    return LiveJsonWindow.show(CombatantInspector, {
      id: `organizr-inspector-${combatant.id}`,
      combatId: combatant.parent.id,
      combatantId: combatant.id
    });
  }

  _subject() {
    return game.combats.get(this.#combatId)?.combatants.get(this.#combatantId) ?? null;
  }

  _snapshot(combatant) {
    return combatantSnapshot(combatant);
  }

  _concerns(changed, combatant) {
    const related = [combatant, combatant.actor, combatant.token];
    return related.includes(changed) || related.includes(changed.parent);
  }
}
