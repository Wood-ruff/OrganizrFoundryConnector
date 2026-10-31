import { isImportable } from "./SheetImport.mjs";

const KNOWN_TYPES = ["character", "npc", "item", "spell", "action", "loot", "status"];

/**
 * Keeps the sheet entries whose searchable text contains every word of the term
 * (name, type, level, tags, project name; never images).
 */
export function filterSheets(entries, term) {
  const words = (term ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [...(entries ?? [])];
  return (entries ?? []).filter((entry) => {
    const text = searchText(entry);
    return words.every((word) => text.includes(word));
  });
}

/** Groups sheet entries into projects, each holding its sheet types in server order. */
export function groupSheets(entries) {
  const projects = new Map();
  for (const entry of entries ?? []) {
    const project = projectGroup(projects, entry);
    const type = typeGroup(project, entry);
    type.sheets.push(sheetRow(entry));
  }
  return [...projects.values()].map(finishProject);
}

/** The Foundry actor id behind a synced sheet's uuid ("Actor.<id>"), or null. */
export function worldActorId(uuid) {
  if (typeof uuid !== "string" || !uuid.startsWith("Actor.")) return null;
  const id = uuid.slice("Actor.".length);
  return id.includes(".") ? null : id;
}

/** Localization key for a failed sheet list request, by HTTP status (0 = no response). */
export function listErrorKey(status) {
  if (status === 0) return "ORGANIZR.Browser.Errors.Unreachable";
  if (status === 401) return "ORGANIZR.Browser.Errors.TokenRejected";
  if (status === 403) return "ORGANIZR.Browser.Errors.Forbidden";
  return "ORGANIZR.Browser.Errors.ServerError";
}

function searchText(entry) {
  const parts = [entry.name, entry.type, entry.level, entry.projectName, ...(entry.tags ?? [])];
  return parts.filter((part) => part !== null && part !== undefined).join(" ").toLowerCase();
}

function projectGroup(projects, entry) {
  const key = String(entry.projectId);
  if (!projects.has(key)) {
    projects.set(key, { projectId: entry.projectId, projectName: entry.projectName ?? "", types: new Map() });
  }
  return projects.get(key);
}

function typeGroup(project, entry) {
  const type = entry.type ?? "other";
  if (!project.types.has(type)) {
    project.types.set(type, { type, labelKey: typeLabelKey(type), sheets: [] });
  }
  return project.types.get(type);
}

function typeLabelKey(type) {
  return KNOWN_TYPES.includes(type) ? `ORGANIZR.Browser.Types.${type}` : null;
}

function sheetRow(entry) {
  return {
    fileId: entry.fileId,
    type: entry.type ?? "other",
    importable: isImportable(entry.type, entry.system),
    name: entry.name ?? "",
    level: entry.level ?? null,
    imageFileId: entry.imageFileId ?? null,
    tags: entry.tags ?? [],
    uuid: entry.uuid ?? null,
    worldActorId: worldActorId(entry.uuid),
    updatedAt: entry.updatedAt ?? null
  };
}

function finishProject(project) {
  const types = [...project.types.values()].map(finishType);
  const count = types.reduce((sum, type) => sum + type.sheets.length, 0);
  const importableCount = types.reduce((sum, type) => sum + type.importableCount, 0);
  return { projectId: project.projectId, projectName: project.projectName, types, count, importableCount };
}

function finishType(type) {
  const importableCount = type.sheets.filter((sheet) => sheet.importable).length;
  return { ...type, importableCount };
}

/** The importable sheet rows in one project, or in one of its type groups when `type` is given. */
export function importableSheets(projects, projectId, type) {
  const project = projects.find((candidate) => String(candidate.projectId) === String(projectId));
  if (!project) return [];
  const groups = type ? project.types.filter((group) => group.type === type) : project.types;
  return groups.flatMap((group) => group.sheets.filter((sheet) => sheet.importable));
}

/** File ids of the importable sheets in one project, or in one of its type groups when `type` is given. */
export function importableFileIds(projects, projectId, type) {
  return importableSheets(projects, projectId, type).map((sheet) => sheet.fileId);
}

/**
 * Splits a batch into sheets to create (not in this world), to refresh (linked) and linked loot that is skipped
 * so a looted chest is not restocked; restoring the inventory moves that loot into `refresh`.
 */
export function batchPlan(sheets, linkedFileIds, restoreInventory = false) {
  const plan = { create: [], refresh: [], skippedLoot: [] };
  for (const sheet of sheets ?? []) {
    if (!linkedFileIds.has(String(sheet.fileId))) plan.create.push(sheet);
    else if (sheet.type === "loot" && !restoreInventory) plan.skippedLoot.push(sheet);
    else plan.refresh.push(sheet);
  }
  return plan;
}
