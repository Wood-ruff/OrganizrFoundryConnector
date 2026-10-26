import { companionFlag } from "./Companions.mjs";

const SENDABLE_ACTOR_TYPES = ["npc", "loot"];
const SENDABLE_ITEM_TYPES = [
  "spell", "action", "feat",
  "weapon", "armor", "shield", "equipment", "consumable", "treasure", "backpack", "ammo", "book"
];
const COIN_CATEGORY = "coin";
const MAX_BODY_BYTES = 5 * 1024 * 1024;

/**
 * Whether "Send to Organizr" applies: world NPC/loot actors and physical, spell, action and feat items (not coins,
 * not the action companions an Organizr item brought along).
 */
export function isSendable(data, documentName) {
  if (!data || data.pack || companionFlag(data)) return false;
  if (documentName === "Actor") return SENDABLE_ACTOR_TYPES.includes(data.type);
  if (documentName !== "Item") return false;
  if (!SENDABLE_ITEM_TYPES.includes(data.type)) return false;
  return !(data.type === "treasure" && data.system?.category === COIN_CATEGORY);
}

/** The body of the document endpoint: the source data plus documentName, uuids and the known Organizr file. */
export function sendBody(data, { documentName, uuid, itemUuids = new Map(), fileId = null }) {
  const body = { ...structuredClone(data), documentName, uuid };
  if (documentName === "Actor") body.items = (body.items ?? []).map((item) => withItemUuid(item, itemUuids));
  if (fileId !== null && fileId !== undefined) body.organizr = { fileId: Number(fileId) };
  return body;
}

/** Whether the body stays within the server's 5 MB limit. */
export function fitsSendLimit(body) {
  return new TextEncoder().encode(JSON.stringify(body)).length <= MAX_BODY_BYTES;
}

/**
 * Whether a document's sheet flag is its own and not one a Foundry Duplicate copied along: the flag names the
 * document's uuid, or it is older than that field.
 */
export function ownsSheetFlag(flag, documentUuid) {
  if (!flag) return false;
  if (!flag.documentUuid) return true;
  return flag.documentUuid === documentUuid;
}

/** The sheet flag written after a successful send: the document's own uuid, a stored portrait remembered. */
export function sentFlag(result, link, previousFlag, documentUuid) {
  return {
    fileId: result.fileId,
    projectId: projectIdOf(link.projectId),
    type: result.kind,
    portraitFileId: previousFlag?.portraitFileId ?? null,
    documentUuid: documentUuid ?? null
  };
}

/** Localization key, format data and server lines for the notifications after a successful send. */
export function sendOutcome(result) {
  const key = result.synced ? "ORGANIZR.Send.Updated" : "ORGANIZR.Send.Created";
  const notes = linesOf(result.notes);
  const dropped = linesOf(result.dropped);
  const data = { kind: result.kind ?? "", created: result.created ?? 0, updated: result.updated ?? 0 };
  return { key, data, notes, dropped, droppedSummary: droppedSummary(dropped) };
}

/** Localization key for a failed send, by HTTP status (0 = no response). */
export function sendErrorKey(status) {
  if (status === 0) return "ORGANIZR.Send.Errors.Unreachable";
  if (status === 401) return "ORGANIZR.Send.Errors.TokenRejected";
  if (status === 403) return "ORGANIZR.Send.Errors.WrongProject";
  if (status === 404) return "ORGANIZR.Send.Errors.ProjectNotFound";
  if (status === 400 || status === 422) return "ORGANIZR.Send.Errors.Refused";
  return "ORGANIZR.Send.Errors.ServerError";
}

function withItemUuid(item, itemUuids) {
  const uuid = itemUuids.get(item._id);
  return uuid ? { ...item, uuid } : item;
}

function projectIdOf(projectId) {
  const number = Number(projectId);
  return Number.isInteger(number) && number > 0 ? number : projectId;
}

function linesOf(lines) {
  return Array.isArray(lines) ? lines.filter((line) => typeof line === "string") : [];
}

function droppedSummary(dropped) {
  if (!dropped.length) return null;
  return { count: dropped.length, first: dropped.slice(0, 2).join("; ") };
}
