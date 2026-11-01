import { MODULE_ID } from "../config/ModuleId.mjs";

const CONTENT_ROLE = "content";

/**
 * `{document, companions}` from the sheet endpoint, the companions without a container's contents (role "content");
 * an older server's bare document has no companions.
 */
export function splitPayload(payload) {
  if (isWrappedPayload(payload)) {
    const companions = usableCompanions(payload).filter((companion) => !isContent(companion));
    return { document: payload.document, companions };
  }
  return { document: payload ?? {}, companions: [] };
}

/** The companions of the sheet endpoint that are a container's contents (role "content"), role kept. */
export function contentCompanions(payload) {
  if (!isWrappedPayload(payload)) return [];
  return usableCompanions(payload).filter(isContent);
}

/** The world Item data of one companion: its document flagged with the owner sheet and label, the sheet flag removed. */
export function companionData(companion, ownerFileId) {
  return dataFlaggedAs(companion, "companion", { fileId: Number(ownerFileId), label: companion.label });
}

/**
 * The world Item data of one content companion: flagged `content` with the owner sheet (an ordinary item, sendable on
 * its own), the sheet flag removed, placed in the container with this id.
 */
export function contentData(companion, ownerFileId, containerId) {
  const data = dataFlaggedAs(companion, "content", { fileId: Number(ownerFileId) });
  data.system = { ...(data.system ?? {}), container: containerId };
  return data;
}

/** The companion flag of a document, or null. */
export function companionFlag(data) {
  return data?.flags?.[MODULE_ID]?.companion ?? null;
}

/** Whether a world document is the companion with this label of the owner sheet. */
export function isCompanionOf(data, ownerFileId, label) {
  const flag = companionFlag(data);
  if (!flag) return false;
  return String(flag.fileId) === String(ownerFileId) && flag.label === label;
}

/** The data of the world Item folder that holds an owner sheet's companions. */
export function companionFolderData(ownerName, ownerFileId) {
  return { name: ownerName, type: "Item", flags: { [MODULE_ID]: { companionsOf: Number(ownerFileId) } } };
}

/** Whether a folder is the companion folder of the owner sheet. */
export function isCompanionFolderOf(folder, ownerFileId) {
  if (folder?.type !== "Item") return false;
  const owner = folder.flags?.[MODULE_ID]?.companionsOf;
  return owner !== undefined && owner !== null && String(owner) === String(ownerFileId);
}

function dataFlaggedAs(companion, flagKey, flag) {
  const data = structuredClone(companion.document);
  const flags = data.flags ?? {};
  const scope = { ...(flags[MODULE_ID] ?? {}) };
  delete scope.sheet;
  scope[flagKey] = flag;
  data.flags = { ...flags, [MODULE_ID]: scope };
  return data;
}

function isWrappedPayload(payload) {
  return Boolean(payload) && typeof payload.document === "object" && payload.document !== null && !("system" in payload);
}

function usableCompanions(payload) {
  const companions = Array.isArray(payload.companions) ? payload.companions : [];
  return companions.filter(isUsableCompanion);
}

function isContent(companion) {
  return companion.role === CONTENT_ROLE;
}

function isUsableCompanion(companion) {
  return Boolean(companion) && typeof companion.label === "string" && typeof companion.document === "object" && companion.document !== null;
}
