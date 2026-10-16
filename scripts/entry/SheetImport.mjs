import {
  documentKind, linkBody, linkedIndex, portraitFileName, sheetFlag, withPortrait, withRequestedFileId
} from "../service/SheetImport.mjs";
import { readWorldLink } from "../config/ModuleSettings.mjs";
import { worldInfo } from "../config/WorldInfo.mjs";
import { createOrganizrClient } from "../client/OrganizrClient.mjs";
import { storePortrait } from "../persistence/PortraitStore.mjs";

const organizr = createOrganizrClient();

/** Every world actor and item that was imported from an Organizr sheet, by file id. */
export function linkedWorldDocuments() {
  return linkedIndex([...game.actors.contents, ...game.items.contents]);
}

/**
 * Imports one Organizr sheet into this world: fetches its Foundry document, stores the portrait,
 * creates the actor/item or replaces the copy already linked to the sheet, then records the Foundry uuid in Organizr.
 * Returns { name, updated, warnings } where warnings are localization keys of non-fatal problems.
 */
export async function importSheet(fileId) {
  const link = readWorldLink();
  const world = worldInfo();
  const warnings = [];
  const payload = await organizr.fetchFoundryDocument(link, fileId, world.systemId);
  const data = withRequestedFileId(payload ?? {}, fileId);
  const kind = documentKind(data, game.documentTypes);
  if (!kind) throw new Error(game.i18n.format("ORGANIZR.Browser.Errors.UnknownType", { type: data?.type ?? "?" }));
  const document = await withStoredPortrait(data, link, warnings);
  const existing = linkedWorldDocuments().get(String(fileId));
  const result = existing ? await replaceDocument(existing, document) : await CONFIG[kind].documentClass.create(document);
  await recordLink(link, fileId, result, world, warnings);
  return { name: result.name, updated: Boolean(existing), warnings };
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

async function replaceDocument(existing, document) {
  await existing.importFromJSON(JSON.stringify(document));
  return existing;
}

async function recordLink(link, fileId, document, world, warnings) {
  try {
    await organizr.linkSheet(link, fileId, linkBody(document.uuid, world.id));
  } catch (error) {
    console.warn("Organizr connector: link not recorded", error);
    warnings.push("ORGANIZR.Browser.LinkFailed");
  }
}
