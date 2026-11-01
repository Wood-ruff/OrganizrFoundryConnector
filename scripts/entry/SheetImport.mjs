import {
  appliesPortrait, contentsReplacement, documentKind, holdsContents, linkBody, linkedIndex, pickLinked, portraitFileName,
  sheetFlag, withDocumentUuid, withPortrait, withRequestedFileId
} from "../service/SheetImport.mjs";
import { createSeed, importDataApplies, refreshedDocument, seededDocument } from "../service/DocumentRefresh.mjs";
import {
  companionData, companionFolderData, contentCompanions, isCompanionFolderOf, isCompanionOf, splitPayload
} from "../service/Companions.mjs";
import { MODULE_ID, readWorldLink } from "../config/ModuleSettings.mjs";
import { worldInfo } from "../config/WorldInfo.mjs";
import { createOrganizrClient } from "../client/OrganizrClient.mjs";
import { storePortrait } from "../persistence/PortraitStore.mjs";

const organizr = createOrganizrClient();

/** Every world actor and item that was imported from an Organizr sheet, by file id (all copies per id). */
export function linkedWorldDocuments() {
  return linkedIndex([...game.actors.contents, ...game.items.contents]);
}

/**
 * Imports one Organizr sheet into this world: fetches its Foundry document and companions, stores an actor portrait,
 * creates the document or refreshes the linked copy (keeping its play state), replaces a dnd5e container's contents,
 * then records the uuid in Organizr.
 * Returns { name, uuid, updated, warnings, duplicates, companions } where warnings are localization keys.
 */
export async function importSheet(fileId, { recordedUuid = null, restoreInventory = false } = {}) {
  const link = readWorldLink();
  const world = worldInfo();
  const warnings = [];
  const payload = await organizr.fetchFoundryDocument(link, fileId, world.systemId);
  const { document: incoming, companions } = splitPayload(payload);
  const data = withRequestedFileId(incoming, fileId);
  const kind = documentKind(data, game.documentTypes);
  if (!kind) throw new Error(game.i18n.format("ORGANIZR.Browser.Errors.UnknownType", { type: data?.type ?? "?" }));
  const document = appliesPortrait(kind, data) ? await withStoredPortrait(data, link, warnings) : data;
  const { target, duplicates } = linkedCopy(fileId, kind, recordedUuid);
  const result = target
    ? await refreshDocument(target, document, restoreInventory)
    : await createDocument(kind, document, world.systemId);
  await stampDocumentUuid(result);
  if (holdsContents(kind, data, world.systemId)) {
    const contents = contentCompanions(payload);
    await replaceContents(result, contents, { fileId, restoreInventory, systemId: world.systemId, warnings });
  }
  const companionOutcome = await importCompanions(companions, fileId, result.name, world.systemId);
  await recordLink(link, fileId, result, world, warnings);
  return { name: result.name, uuid: result.uuid, updated: Boolean(target), warnings, duplicates, companions: companionOutcome };
}

function linkedCopy(fileId, kind, recordedUuid) {
  const copies = linkedWorldDocuments().get(String(fileId)) ?? [];
  return pickLinked(copies.filter((copy) => copy.documentName === kind), recordedUuid);
}

async function withStoredPortrait(data, link, warnings) {
  const portraitId = sheetFlag(data)?.portraitFileId;
  if (!portraitId) return data;
  try {
    const blob = await organizr.fetchFileBlob(link, portraitId);
    const fileName = portraitFileName(portraitId, blob.type);
    if (!fileName) throw new Error(`unsupported image type ${blob.type}`);
    return withPortrait(data, await storePortrait(blob, fileName));
  } catch (error) {
    console.warn("Organizr connector: portrait not stored", error);
    warnings.push("ORGANIZR.Browser.PortraitFailed");
    return data;
  }
}

/** Writes the document's own uuid into its sheet flag, so a later Duplicate of it is known as a copy. */
async function stampDocumentUuid(document) {
  const flag = sheetFlag(document);
  if (!flag || flag.documentUuid === document.uuid) return;
  await document.setFlag(MODULE_ID, "sheet", withDocumentUuid(flag, document.uuid));
}

async function refreshDocument(target, document, restoreInventory) {
  const replacement = refreshedDocument(target.toObject(), document, { restoreInventory });
  await target.importFromJSON(JSON.stringify(replacement));
  return target;
}

/** Creates a blank document and fills it through Import Data, so the system's import filtering runs as on a refresh. */
async function createDocument(kind, document, systemId, placement = {}) {
  const documentClass = CONFIG[kind].documentClass;
  if (!importDataApplies(systemId, document)) {
    return documentClass.create({ ...document, ...placement }, { renderSheet: false });
  }
  const created = await documentClass.create({ ...createSeed(document), ...placement }, { renderSheet: false });
  try {
    await created.importFromJSON(JSON.stringify(seededDocument(created.toObject(), document)));
  } catch (error) {
    await created.delete();
    throw error;
  }
  return created;
}

/**
 * Deletes everything the container holds now and creates the exported contents in it (in the container's folder);
 * unless restoring, contents that come back keep their spent uses. A content that fails is a warning only.
 */
async function replaceContents(container, contents, { fileId, restoreInventory, systemId, warnings }) {
  const currentContents = (await containedItems(container)).map((item) => item.toObject());
  const plan = contentsReplacement(container.id, currentContents, contents, { ownerFileId: fileId, restoreInventory });
  if (plan.deleteIds.length) await CONFIG.Item.documentClass.deleteDocuments(plan.deleteIds);
  let failed = 0;
  for (const data of plan.create) {
    try {
      await createDocument("Item", data, systemId, { folder: container.folder?.id ?? null });
    } catch (error) {
      console.warn(`Organizr connector: content "${data.name}" not imported`, error);
      failed += 1;
    }
  }
  if (failed > 0) warnings.push("ORGANIZR.Browser.ContentsFailed");
}

async function containedItems(container) {
  const contained = await container.system?.allContainedItems;
  return contained ? Array.from(contained.values()) : [];
}

async function importCompanions(companions, ownerFileId, ownerName, systemId) {
  const outcome = { count: 0, failed: 0, folderName: null };
  if (!companions.length) return outcome;
  let folder = findCompanionFolder(ownerFileId);
  for (const companion of companions) {
    try {
      folder = await importCompanion(companion, ownerFileId, ownerName, systemId, folder);
      outcome.count += 1;
    } catch (error) {
      console.warn(`Organizr connector: companion "${companion.label}" not imported`, error);
      outcome.failed += 1;
    }
  }
  outcome.folderName = folder?.name ?? ownerName;
  return outcome;
}

async function importCompanion(companion, ownerFileId, ownerName, systemId, folder) {
  const data = companionData(companion, ownerFileId);
  const existing = game.items.find((item) => isCompanionOf(item, ownerFileId, companion.label));
  if (existing) {
    await existing.importFromJSON(JSON.stringify(data));
    return folder;
  }
  const target = folder ?? await CONFIG.Folder.documentClass.create(companionFolderData(ownerName, ownerFileId));
  await createDocument("Item", data, systemId, { folder: target.id });
  return target;
}

function findCompanionFolder(ownerFileId) {
  return game.folders.find((folder) => isCompanionFolderOf(folder, ownerFileId)) ?? null;
}

async function recordLink(link, fileId, document, world, warnings) {
  try {
    await organizr.linkSheet(link, fileId, linkBody(document.uuid, world.id));
  } catch (error) {
    console.warn("Organizr connector: link not recorded", error);
    warnings.push("ORGANIZR.Browser.LinkFailed");
  }
}
