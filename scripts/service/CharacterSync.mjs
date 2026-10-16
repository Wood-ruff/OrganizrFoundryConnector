import { characterExport } from "./CharacterExport.mjs";
import { MODULE_ID } from "../config/ModuleId.mjs";

/**
 * The request body for the Organizr character endpoint: the export plus the Foundry uuids and,
 * when the actor is already known to Organizr, the file it belongs to.
 */
export function syncBody(actor, world) {
  const data = characterExport(actor, world);
  const itemUuids = itemUuidsOf(actor);
  data.uuid = actor.uuid;
  data.items = (data.items ?? []).map((item, index) => withUuid(item, itemUuids, index));
  const fileId = knownFileId(actor);
  if (fileId !== null) data.organizr = { fileId };
  return data;
}

/** The Organizr file this actor was imported from or last pushed to, or null. */
export function knownFileId(actor) {
  const flags = actor.flags?.[MODULE_ID] ?? {};
  return flags.sheet?.fileId ?? flags.sync?.characterFileId ?? null;
}

/** What the module remembers on the actor after a successful push. */
export function syncFlag(result, link, syncedAt) {
  return {
    characterFileId: result.characterFileId,
    folderId: result.folderId,
    serverUrl: link.serverUrl,
    projectId: link.projectId,
    syncedAt
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

function itemUuidsOf(actor) {
  const items = actor.items?.contents ?? [];
  const byId = new Map(items.map((item) => [item.id, item.uuid]));
  return { byId, ordered: items.map((item) => item.uuid) };
}

function withUuid(item, itemUuids, index) {
  const uuid = itemUuids.byId.get(item._id) ?? itemUuids.ordered[index] ?? null;
  return uuid ? { ...item, uuid } : item;
}
