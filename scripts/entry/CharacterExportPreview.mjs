import { characterExport } from "../service/CharacterExport.mjs";
import { worldInfo } from "../config/WorldInfo.mjs";
import { LiveJsonWindow } from "./LiveJsonWindow.mjs";

/** Live preview of the exact JSON that "Sync" sends for a player character. */
export class CharacterExportPreview extends LiveJsonWindow {
  static DEFAULT_OPTIONS = {
    window: { title: "ORGANIZR.Characters.PreviewTitle" }
  };

  static LIVE_HOOKS = [
    "updateActor", "createItem", "updateItem", "deleteItem",
    "createActiveEffect", "updateActiveEffect", "deleteActiveEffect"
  ];

  #actorId;

  constructor({ actorId, ...options }) {
    super(options);
    this.#actorId = actorId;
  }

  static show(actor) {
    return LiveJsonWindow.show(CharacterExportPreview, {
      id: `organizr-character-export-${actor.id}`,
      actorId: actor.id
    });
  }

  _subject() {
    return game.actors.get(this.#actorId) ?? null;
  }

  _snapshot(actor) {
    return characterExport(actor, worldInfo());
  }

  _concerns(changed, actor) {
    return changed === actor || changed.parent === actor;
  }
}
