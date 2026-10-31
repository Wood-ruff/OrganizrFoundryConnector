import { characterExport } from "./CharacterExport.mjs";
import { withLocalizedResistanceLabels } from "./RuleLabels.mjs";
import { MODULE_ID } from "../config/ModuleId.mjs";
import { ownsSheetFlag } from "./DocumentSend.mjs";
import { derivedTotalsFor } from "./Pf1Totals.mjs";

/**
 * The request body for the Organizr character endpoint: the export plus the Foundry uuids and,
 * when the actor is already known to Organizr, the file it belongs to; a pf1 character also carries the totals pf1
 * prepared (`derivedTotals`). With a localizer, custom resistance labels that are pf2e lang keys are sent as their
 * localized text.
 */
export function syncBody(actor, world, localize = null) {
  const exported = characterExport(actor, world);
  const data = localize ? withLocalizedResistanceLabels(exported, localize) : exported;
  const itemUuids = itemUuidsOf(actor);
  data.uuid = actor.uuid;
  data.items = (data.items ?? []).map((item, index) => withUuid(item, itemUuids, index));
  const fileId = knownFileId(actor);
  if (fileId !== null) data.organizr = { fileId };
  const derivedTotals = derivedTotalsFor(world.systemId, actor);
  if (derivedTotals) data.derivedTotals = derivedTotals;
  return data;
}

/**
 * The Organizr file this actor was imported from or last pushed to, or null. A flag a Foundry Duplicate copied
 * from another actor (its documentUuid names that actor) does not count; a token actor answers for its base actor.
 */
export function knownFileId(actor) {
  const flags = actor.flags?.[MODULE_ID] ?? {};
  const ownerUuid = flagOwnerUuid(actor);
  const sheetFileId = ownsSheetFlag(flags.sheet, ownerUuid) ? flags.sheet.fileId : null;
  const syncFileId = ownsSheetFlag(flags.sync, ownerUuid) ? flags.sync.characterFileId : null;
  return sheetFileId ?? syncFileId ?? null;
}

/** Whether the actor carries an Organizr file flag that belongs to another actor it was duplicated from. */
export function isCopiedActor(actor) {
  return flaggedFileId(actor) !== null && knownFileId(actor) === null;
}

/** The Organizr file the sheet flag, else the sync flag names, whichever document the flags belong to; or null. */
export function flaggedFileId(document) {
  const flags = document?.flags?.[MODULE_ID] ?? {};
  return flags.sheet?.fileId ?? flags.sync?.characterFileId ?? null;
}

/** What the module remembers on the actor after a successful push. */
export function syncFlag(result, link, syncedAt, documentUuid) {
  return {
    characterFileId: result.characterFileId,
    folderId: result.folderId,
    serverUrl: link.serverUrl,
    projectId: link.projectId,
    syncedAt,
    documentUuid: documentUuid ?? null
  };
}

/** Localization key + data for the notification after a successful push. */
export function syncOutcome(result) {
  const key = result.synced ? "ORGANIZR.Characters.SyncUpdated" : "ORGANIZR.Characters.SyncCreated";
  const notes = result.notes ?? [];
  return { key, data: { created: result.created ?? 0, updated: result.updated ?? 0, notes: notes.length }, notes };
}

/** Localization key for a failed push, by HTTP status (0 = no response). */
export function syncErrorKey(status) {
  if (status === 0) return "ORGANIZR.Characters.Errors.Unreachable";
  if (status === 401) return "ORGANIZR.Characters.Errors.TokenRejected";
  if (status === 403) return "ORGANIZR.Characters.Errors.WrongProject";
  if (status === 404) return "ORGANIZR.Characters.Errors.ProjectNotFound";
  return "ORGANIZR.Characters.Errors.ServerError";
}

/** The uuid a flag is stamped with: the world actor's own, the base actor's for a token actor. */
function flagOwnerUuid(actor) {
  if (!actor.isToken) return actor.uuid;
  return actor.token?.baseActor?.uuid ?? `Actor.${actor.id}`;
}

function itemUuidsOf(actor) {
  const items = actor.items?.contents ?? [];
  const byId = new Map(items.map((item) => [item.id, item.uuid]));
  return { byId, ordered: items.map((item) => item.uuid) };
}

function withUuid(item, itemUuids, index) {
  const uuid = itemUuids.byId.get(item._id) ?? itemUuids.ordered[index] ?? null;
  return uuid ? { ...item, uuid } : item;
}
