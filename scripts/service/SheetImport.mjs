import { MODULE_ID } from "../config/ModuleId.mjs";

const IMPORTABLE_TYPES = ["npc", "item", "spell", "action", "loot"];
const DEFAULT_TOKEN_IMAGE = "icons/svg/mystery-man.svg";
const IMAGE_EXTENSIONS = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "image/svg+xml": "svg"
};

/** Whether Organizr can export this sheet kind as a Foundry document. */
export function isImportable(type) {
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

/** Map of Organizr file id → world document for every document carrying the sheet flag. */
export function linkedIndex(documents) {
  const index = new Map();
  for (const document of documents ?? []) {
    const fileId = sheetFlag(document)?.fileId;
    if (fileId !== undefined && fileId !== null) index.set(String(fileId), document);
  }
  return index;
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

/** Copy of the document showing the stored portrait; the prototype token follows unless it has its own image. */
export function withPortrait(document, path) {
  const result = { ...document, img: path };
  if (!("prototypeToken" in document)) return result;
  const token = document.prototypeToken ?? {};
  const texture = token.texture ?? {};
  if (texture.src && texture.src !== DEFAULT_TOKEN_IMAGE) return result;
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
