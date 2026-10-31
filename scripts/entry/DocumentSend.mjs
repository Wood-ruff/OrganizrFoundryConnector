import {
  fitsSendLimit, isSendable, legacyFlagCandidates, needsRecordedUuid, ownsSheetFlagAmong, recordedUuidOf, sendBody,
  sendErrorKey, sendOutcome, sentFlag
} from "../service/DocumentSend.mjs";
import { pf1DerivedTotals, sendsDerivedTotals } from "../service/Pf1Totals.mjs";
import { sheetFlag } from "../service/SheetImport.mjs";
import { linkedWorldDocuments } from "./SheetImport.mjs";
import { isWorldLinked } from "../service/WorldLink.mjs";
import { MODULE_ID, readWorldLink } from "../config/ModuleSettings.mjs";
import { createOrganizrClient } from "../client/OrganizrClient.mjs";
import { contextMenuEntry, directoryEntryId, isWorldDirectory } from "../util/ContextMenuEntry.mjs";

const SEND_ICON = "fa-solid fa-cloud-arrow-up";

const organizr = createOrganizrClient();
const sending = new Set();

/** Adds "Send to Organizr" to the Actors/Items directory context menus and to actor and item sheet headers. */
export function registerSendControls() {
  Hooks.on("getActorContextOptions", (app, entries) => addContextEntry(app, entries, game.actors));
  Hooks.on("getItemContextOptions", (app, entries) => addContextEntry(app, entries, game.items));
  Hooks.on("getActorSheetHeaderButtons", addHeaderButton);
  Hooks.on("getItemSheetHeaderButtons", addHeaderButton);
}

/** Sends one actor or item to Organizr, which creates or updates its sheet; the document then carries the sheet flag. */
export async function sendToOrganizr(document) {
  if (!canSend(document) || sending.has(document.uuid)) return;
  sending.add(document.uuid);
  try {
    await send(document, readWorldLink());
  } finally {
    sending.delete(document.uuid);
  }
}

function addContextEntry(app, entries, worldCollection) {
  if (!isWorldDirectory(app, worldCollection)) return;
  entries.push(contextEntry((li) => worldCollection.get(directoryEntryId(li))));
}

function contextEntry(documentOf) {
  return contextMenuEntry(game.release.generation, {
    label: "ORGANIZR.Send.Action",
    icon: SEND_ICON,
    isVisible: (li) => canSend(documentOf(li)),
    run: (li) => sendToOrganizr(documentOf(li))
  });
}

function addHeaderButton(sheet, buttons) {
  const document = sheet.document;
  if (!canSend(document)) return;
  buttons.unshift({ label: "ORGANIZR.Send.Action", class: "organizr-send", icon: SEND_ICON, onclick: () => sendToOrganizr(document) });
}

function canSend(document) {
  if (!document || !game.user.isGM || !isWorldLinked(readWorldLink())) return false;
  return isSendable(sendableView(document), document.documentName, game.system.id);
}

function sendableView(document) {
  return {
    type: document.type,
    system: { category: document.system?.category },
    pack: document.pack ?? null,
    flags: document.flags
  };
}

async function send(document, link) {
  const data = document.toObject();
  const flag = sheetFlag(data);
  const previous = await ownsFlag(document, data, link) ? flag : null;
  if (flag && !previous) {
    ui.notifications.info("ORGANIZR.Send.Copy", { localize: true, format: { name: document.name } });
  }
  const body = sendBody(data, {
    documentName: document.documentName,
    uuid: document.uuid,
    itemUuids: itemUuidsOf(document),
    fileId: previous?.fileId ?? null,
    derivedTotals: derivedTotalsOf(document)
  });
  if (!fitsSendLimit(body)) {
    ui.notifications.error("ORGANIZR.Send.Errors.TooLarge", { localize: true, format: { name: document.name } });
    return;
  }
  let result;
  try {
    result = await organizr.pushDocument(link, body);
  } catch (error) {
    const key = sendErrorKey(error.status ?? -1);
    ui.notifications.error(key, { localize: true, format: { name: document.name, message: error.message } });
    return;
  }
  await document.setFlag(MODULE_ID, "sheet", sentFlag(result, link, previous, document.uuid));
  notifySent(document.name, sendOutcome(result));
}

/** The totals pf1 derived for a prepared NPC, null for every other document. */
function derivedTotalsOf(document) {
  if (!sendsDerivedTotals(game.system.id, document.documentName, document.type)) return null;
  return pf1DerivedTotals(document.system);
}

/** Whether the document's sheet flag is its own; asks Organizr for the recorded uuid only when legacy copies compete. */
async function ownsFlag(document, data, link) {
  const view = copyView(document.uuid, data);
  const copies = sameKindCopies(document, sheetFlag(data)?.fileId);
  const recordedUuid = await recordedUuidWhenNeeded(link, view, copies);
  return ownsSheetFlagAmong(view, copies, recordedUuid);
}

async function recordedUuidWhenNeeded(link, view, copies) {
  if (!needsRecordedUuid(legacyFlagCandidates(view, copies))) return null;
  return recordedUuidFor(link, sheetFlag(view).fileId);
}

function sameKindCopies(document, fileId) {
  if (fileId === undefined || fileId === null) return [];
  const copies = linkedWorldDocuments().get(String(fileId)) ?? [];
  return copies
    .filter((copy) => copy.documentName === document.documentName)
    .map((copy) => copyView(copy.uuid, copy));
}

function copyView(uuid, source) {
  return { uuid, flags: source.flags, _stats: { createdTime: source._stats?.createdTime ?? null } };
}

async function recordedUuidFor(link, fileId) {
  try {
    const recordedUuid = recordedUuidOf(await organizr.listSheets(link, link.projectId), fileId);
    if (!recordedUuid) console.warn(`Organizr connector: no recorded uuid for sheet ${fileId}, the oldest copy owns it`);
    return recordedUuid;
  } catch (error) {
    console.warn("Organizr connector: sheet list not read, the oldest copy owns the sheet flag", error);
    return null;
  }
}

function itemUuidsOf(document) {
  if (document.documentName !== "Actor") return new Map();
  return new Map(document.items.contents.map((item) => [item.id, item.uuid]));
}

function notifySent(name, outcome) {
  ui.notifications.info(outcome.key, { localize: true, format: { name, ...outcome.data } });
  if (outcome.droppedSummary) {
    ui.notifications.warn("ORGANIZR.Send.Dropped", { localize: true, format: { name, ...outcome.droppedSummary } });
  }
  for (const note of outcome.notes) console.info(`Organizr connector: ${name}: ${note}`);
  for (const line of outcome.dropped) console.info(`Organizr connector: ${name}: not kept: ${line}`);
}
