import { MODULE_ID } from "../config/ModuleId.mjs";
import { companionFlag } from "./Companions.mjs";
import { pickLinked, sheetFlag } from "./SheetImport.mjs";

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

/**
 * The body of the document endpoint: the source data plus documentName, uuids and the known Organizr file. Without a
 * known file (a copy) the body drops the sheet flag, so the server does not take it for the original's file.
 */
export function sendBody(data, { documentName, uuid, itemUuids = new Map(), fileId = null }) {
  const body = { ...structuredClone(data), documentName, uuid };
  if (documentName === "Actor") body.items = (body.items ?? []).map((item) => withItemUuid(item, itemUuids));
  if (fileId !== null && fileId !== undefined) {
    body.organizr = { fileId: Number(fileId) };
  } else {
    dropSheetFlag(body);
  }
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

/**
 * The world copies a legacy sheet flag (no documentUuid) could belong to: the same-kind copies carrying a legacy flag
 * for the same file in world order, the document appended when it is no world copy. Empty when the flag is stamped
 * or a copy is stamped with its own uuid.
 */
export function legacyFlagCandidates(document, sameKindCopies) {
  const flag = sheetFlag(document);
  if (!flag || flag.documentUuid) return [];
  const sameFile = (sameKindCopies ?? []).filter((copy) => isSameFile(copy, flag.fileId));
  if (sameFile.some(isSelfStamped)) return [];
  const legacyCopies = sameFile.filter((copy) => !sheetFlag(copy).documentUuid);
  if (legacyCopies.some((copy) => copy.uuid === document.uuid)) return legacyCopies;
  return [...legacyCopies, document];
}

/** Whether picking the owner of a legacy flag needs the uuid Organizr recorded for the file. */
export function needsRecordedUuid(candidates) {
  return candidates.length > 1;
}

/**
 * Whether a document owns its sheet flag among the world copies of the same file: a stamped flag names the document;
 * a legacy flag belongs to the copy stamped with its own uuid, else the copy Organizr recorded, else the oldest.
 */
export function ownsSheetFlagAmong(document, sameKindCopies, recordedUuid) {
  const flag = sheetFlag(document);
  if (!flag || flag.documentUuid) return ownsSheetFlag(flag, document?.uuid);
  const candidates = legacyFlagCandidates(document, sameKindCopies);
  if (!candidates.length) return false;
  return pickLinked(candidates, recordedUuid).target.uuid === document.uuid;
}

/** The uuid Organizr recorded for a file in its sheet list rows, or null. */
export function recordedUuidOf(sheetRows, fileId) {
  if (!Array.isArray(sheetRows)) return null;
  const row = sheetRows.find((entry) => String(entry?.fileId) === String(fileId));
  return row?.uuid ?? null;
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

function isSameFile(copy, fileId) {
  const copyFileId = sheetFlag(copy)?.fileId;
  if (copyFileId === undefined || copyFileId === null) return false;
  return String(copyFileId) === String(fileId) && !companionFlag(copy);
}

function isSelfStamped(copy) {
  return sheetFlag(copy).documentUuid === copy.uuid;
}

function dropSheetFlag(body) {
  const scope = body.flags?.[MODULE_ID];
  if (scope?.sheet) delete scope.sheet;
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
