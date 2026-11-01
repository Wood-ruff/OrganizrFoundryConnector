import { MODULE_ID } from "../config/ModuleId.mjs";
import { companionFlag, contentData } from "./Companions.mjs";
import { keepDnd5eContentUses } from "./Dnd5ePlayState.mjs";
import { knownFileId } from "./CharacterSync.mjs";

const IMPORTABLE_TYPES = ["npc", "item", "spell", "action", "loot"];
const CHARACTER_TYPE = "character";
const EXPORTED_CHARACTER_SYSTEMS = ["pf1e", "dnd5e"];
const DEFAULT_TOKEN_IMAGE = "icons/svg/mystery-man.svg";
const SYSTEM_DEFAULT_ICONS = [/^systems\/[^/]+\/icons\/default-icons\//, /^systems\/dnd5e\/icons\/svg\/(actors|items)\//];
const CONTENTS_SYSTEM_ID = "dnd5e";
const CONTAINER_TYPE = "container";
const IMAGE_EXTENSIONS = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "image/svg+xml": "svg"
};

/** Whether Organizr can export this sheet kind as a Foundry document; characters only when their system is pf1e or dnd5e. */
export function isImportable(type, system) {
  if (type === CHARACTER_TYPE) return EXPORTED_CHARACTER_SYSTEMS.includes(system);
  return IMPORTABLE_TYPES.includes(type);
}

/** The Organizr origin stamped on an imported document, or null. */
export function sheetFlag(document) {
  return document?.flags?.[MODULE_ID]?.sheet ?? null;
}

/** "Actor" or "Item" by the document's type against the world's registered sub-types, else null. */
export function documentKind(document, documentTypes) {
  const type = document?.type;
  if ((documentTypes?.Actor ?? []).includes(type)) return "Actor";
  if ((documentTypes?.Item ?? []).includes(type)) return "Item";
  return null;
}

/**
 * Map of Organizr file id → every world document linked to that file (companion items excluded): a document under the
 * file its own sheet or sync flag names (`knownFileId`), a Duplicate carrying only another document's sheet flag under
 * that file as a copy, a Duplicate carrying only another actor's sync flag under none.
 */
export function linkedIndex(documents) {
  const index = new Map();
  for (const document of documents ?? []) {
    const fileId = linkedFileIdOf(document);
    if (fileId === null || companionFlag(document)) continue;
    const key = String(fileId);
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(document);
  }
  return index;
}

/** The copy to refresh: the one with the uuid Organizr recorded, else the oldest; plus how many other copies exist. */
export function pickLinked(candidates, recordedUuid) {
  const copies = candidates ?? [];
  if (!copies.length) return { target: null, duplicates: 0 };
  const recorded = recordedUuid ? copies.find((copy) => copy.uuid === recordedUuid) : undefined;
  const target = recorded ?? oldestCopy(copies);
  return { target, duplicates: copies.length - 1 };
}

/** Whether the Organizr portrait replaces the exported image: only for actors whose image is empty or a default. */
export function appliesPortrait(kind, data) {
  if (kind !== "Actor") return false;
  const image = data?.img;
  if (!image) return true;
  return image === DEFAULT_TOKEN_IMAGE || SYSTEM_DEFAULT_ICONS.some((pattern) => pattern.test(image));
}

/** Whether importing this document replaces a container's contents: a container Item in a dnd5e world. */
export function holdsContents(kind, data, systemId) {
  return kind === "Item" && data?.type === CONTAINER_TYPE && systemId === CONTENTS_SYSTEM_ID;
}

/**
 * How a container's contents are replaced: `deleteIds` = everything it holds now (source data), `create` = the
 * exported contents placed in the container with this id; unless restoring, contents that come back keep their
 * spent uses.
 */
export function contentsReplacement(containerId, currentContents, contents, { ownerFileId, restoreInventory = false }) {
  const create = contents.map((content) => contentData(content, ownerFileId, containerId));
  if (!restoreInventory) keepDnd5eContentUses(create, currentContents);
  return { deleteIds: currentContents.map((item) => item._id), create };
}

/** File name for a stored portrait, or null when the id is no plain number or the media type is no image we can place. */
export function portraitFileName(fileId, mimeType) {
  if (!/^\d+$/.test(String(fileId))) return null;
  const extension = IMAGE_EXTENSIONS[(mimeType ?? "").split(";")[0].trim()];
  return extension ? `${fileId}.${extension}` : null;
}

/** Copy of the document whose sheet flag names the file that was actually requested, whatever the payload says. */
export function withRequestedFileId(document, fileId) {
  const flags = document.flags ?? {};
  const scope = flags[MODULE_ID] ?? {};
  const sheet = { ...(scope.sheet ?? {}), fileId: Number(fileId) };
  return { ...document, flags: { ...flags, [MODULE_ID]: { ...scope, sheet } } };
}

/** Copy of a sheet flag that names the document carrying it. */
export function withDocumentUuid(flag, documentUuid) {
  return { ...(flag ?? {}), documentUuid };
}

/** Copy of the document showing the stored portrait; the prototype token follows unless it has its own image. */
export function withPortrait(document, path) {
  const result = { ...document, img: path };
  if (!("prototypeToken" in document)) return result;
  const token = document.prototypeToken ?? {};
  const texture = token.texture ?? {};
  if (!tokenFollowsImage(texture.src, document.img)) return result;
  result.prototypeToken = { ...token, texture: { ...texture, src: path } };
  return result;
}

export function linkBody(uuid, worldId) {
  return { uuid, worldId };
}

/** Localization key for a failed import, by HTTP status (0 = no response). */
export function importErrorKey(status) {
  if (status === 0) return "ORGANIZR.Browser.Errors.Unreachable";
  if (status === 401) return "ORGANIZR.Browser.Errors.TokenRejected";
  if (status === 403) return "ORGANIZR.Browser.Errors.Forbidden";
  if (status === 404) return "ORGANIZR.Browser.Errors.SheetMissing";
  return "ORGANIZR.Browser.Errors.ImportRefused";
}

function linkedFileIdOf(document) {
  const ownedFileId = knownFileId(document);
  if (ownedFileId !== null) return ownedFileId;
  return sheetFlag(document)?.fileId ?? null;
}

function tokenFollowsImage(textureSrc, image) {
  return !textureSrc || textureSrc === DEFAULT_TOKEN_IMAGE || textureSrc === image;
}

function oldestCopy(copies) {
  return [...copies].sort((a, b) => createdTimeOf(a) - createdTimeOf(b))[0];
}

function createdTimeOf(copy) {
  const time = copy?._stats?.createdTime;
  return typeof time === "number" ? time : Number.POSITIVE_INFINITY;
}
