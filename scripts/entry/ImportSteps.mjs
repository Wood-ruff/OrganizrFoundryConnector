import {
  linkBody, linkedIndex, pickLinked, portraitFileName, sheetFlag, withDocumentUuid, withPortrait
} from "../service/SheetImport.mjs";
import { MODULE_ID } from "../config/ModuleSettings.mjs";
import { createOrganizrClient } from "../client/OrganizrClient.mjs";
import { storePortrait } from "../persistence/PortraitStore.mjs";

const organizr = createOrganizrClient();

/** Every world actor and item that was imported from an Organizr sheet, by file id (all copies per id). */
export function linkedWorldDocuments() {
  return linkedIndex([...game.actors.contents, ...game.items.contents]);
}

/** The world copy of this file to refresh (of the document kind), plus how many other copies exist. */
export function linkedCopy(fileId, kind, recordedUuid) {
  const copies = linkedWorldDocuments().get(String(fileId)) ?? [];
  return pickLinked(copies.filter((copy) => copy.documentName === kind), recordedUuid);
}

/** Copy of the data showing the sheet's Organizr portrait stored in this world; a failure is a warning only. */
export async function withStoredPortrait(data, link, warnings) {
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
export async function stampDocumentUuid(document) {
  const flag = sheetFlag(document);
  if (!flag || flag.documentUuid === document.uuid) return;
  await document.setFlag(MODULE_ID, "sheet", withDocumentUuid(flag, document.uuid));
}

/** Records the document's uuid for the sheet in Organizr; a failure is a warning only. */
export async function recordLink(link, fileId, document, world, warnings) {
  try {
    await organizr.linkSheet(link, fileId, linkBody(document.uuid, world.id));
  } catch (error) {
    console.warn("Organizr connector: link not recorded", error);
    warnings.push("ORGANIZR.Browser.LinkFailed");
  }
}
