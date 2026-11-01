import {
  appliesPortrait, contentsReplacement, documentKind, holdsContents, withRequestedFileId
} from "../service/SheetImport.mjs";
import { createSeed, importDataApplies, refreshedDocument, seededDocument } from "../service/DocumentRefresh.mjs";
import { dnd5eSlotsSpent, dnd5eSlotUpdates, isDnd5eData } from "../service/Dnd5ePlayState.mjs";
import {
  companionData, companionFolderData, contentCompanions, isCompanionFolderOf, isCompanionOf, splitPayload
} from "../service/Companions.mjs";
import { readWorldLink } from "../config/ModuleSettings.mjs";
import { worldInfo } from "../config/WorldInfo.mjs";
import { createOrganizrClient } from "../client/OrganizrClient.mjs";
import { linkedCopy, recordLink, stampDocumentUuid, withStoredPortrait } from "./ImportSteps.mjs";

export { linkedWorldDocuments } from "./ImportSteps.mjs";

const organizr = createOrganizrClient();

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

async function refreshDocument(target, document, restoreInventory) {
  const current = target.toObject();
  const slotsSpent = isDnd5eData(current) ? dnd5eSlotsSpent(target.system?.spells) : {};
  const replacement = refreshedDocument(current, document, { restoreInventory });
  await target.importFromJSON(JSON.stringify(replacement));
  await spendSlotsAgain(target, slotsSpent);
  return target;
}

/** Spends a dnd5e actor's slots spent before the refresh again, against the maximum dnd5e derived for the new data. */
async function spendSlotsAgain(target, slotsSpent) {
  const updates = dnd5eSlotUpdates(slotsSpent, target.system?.spells);
  if (Object.keys(updates).length) await target.update(updates);
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
 * Deletes everything the container holds now and the stray contents of its sheet, then creates the exported contents
 * in it (in the container's folder); unless restoring, contents that come back keep their spent uses. A content that
 * fails is a warning only.
 */
async function replaceContents(container, contents, { fileId, restoreInventory, systemId, warnings }) {
  const currentContents = (await containedItems(container)).map((item) => item.toObject());
  const worldItems = game.items.contents;
  const plan = contentsReplacement(container.id, currentContents, contents, { ownerFileId: fileId, restoreInventory, worldItems });
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
