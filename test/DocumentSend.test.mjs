import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fitsSendLimit, isSendable, legacyFlagCandidates, needsRecordedUuid, ownsSheetFlag, ownsSheetFlagAmong, recordedUuidOf,
  sendBody, sendErrorKey, sendOutcome, sentFlag
} from "../scripts/service/DocumentSend.mjs";

const MODULE = "organizr-foundry-connector";
const link = { serverUrl: "https://organizr.example", apiToken: "org_secret", projectId: "12" };

function lootActor() {
  return {
    _id: "lootActor0000001",
    name: "Mossy Chest",
    type: "loot",
    system: { lootSheetType: "Loot" },
    items: [
      { _id: "goldCoins0000001", name: "Gold Pieces", type: "treasure" },
      { _id: "ringOfSparks0001", name: "Ring of Sparks", type: "equipment" },
      { _id: "unknownItem00001", name: "Loose", type: "equipment" }
    ],
    flags: { [MODULE]: { sheet: { fileId: 30, projectId: 12, type: "loot", portraitFileId: 31 } } }
  };
}

test("loot7 send body of a loot actor", () => {
  const data = lootActor();
  const itemUuids = new Map([
    ["goldCoins0000001", "Actor.lootActor0000001.Item.goldCoins0000001"],
    ["ringOfSparks0001", "Actor.lootActor0000001.Item.ringOfSparks0001"]
  ]);
  const body = sendBody(data, { documentName: "Actor", uuid: "Actor.lootActor0000001", itemUuids, fileId: 30 });
  assert.equal(body.documentName, "Actor");
  assert.equal(body.uuid, "Actor.lootActor0000001");
  assert.deepEqual(body.organizr, { fileId: 30 });
  assert.equal(body.name, "Mossy Chest");
  assert.deepEqual(body.system, { lootSheetType: "Loot" });
  assert.deepEqual(body.items.map((item) => item.uuid), [
    "Actor.lootActor0000001.Item.goldCoins0000001",
    "Actor.lootActor0000001.Item.ringOfSparks0001",
    undefined
  ]);
  assert.equal("uuid" in data.items[0], false);
});

test("an item body has no organizr block without a known file and keeps its items untouched", () => {
  const data = { _id: "spell00000000001", name: "Ember Lance", type: "spell", system: {} };
  const body = sendBody(data, { documentName: "Item", uuid: "Actor.a.Item.spell00000000001", fileId: null });
  assert.deepEqual(body, { ...data, documentName: "Item", uuid: "Actor.a.Item.spell00000000001" });
});

test("sendable kinds: NPC, loot, physical items, spells, actions and feats", () => {
  assert.equal(isSendable({ type: "npc" }, "Actor"), true);
  assert.equal(isSendable({ type: "loot" }, "Actor"), true);
  for (const type of ["spell", "action", "feat", "weapon", "armor", "shield", "equipment", "consumable", "treasure", "backpack", "ammo", "book"]) {
    assert.equal(isSendable({ type, system: {} }, "Item"), true, type);
  }
  assert.equal(isSendable({ type: "treasure", system: { category: "gem" } }, "Item"), true);
});

test("coin, character, compendium and other kinds are not sendable", () => {
  assert.equal(isSendable({ type: "treasure", system: { category: "coin" } }, "Item"), false);
  assert.equal(isSendable({ type: "character" }, "Actor"), false);
  assert.equal(isSendable({ type: "hazard" }, "Actor"), false);
  assert.equal(isSendable({ type: "npc", pack: "world.monsters" }, "Actor"), false);
  assert.equal(isSendable({ type: "spell", pack: "pf2e.spells-srd" }, "Item"), false);
  assert.equal(isSendable({ type: "effect" }, "Item"), false);
  assert.equal(isSendable({ type: "condition" }, "Item"), false);
  assert.equal(isSendable({ type: "npc" }, "Item"), false);
  assert.equal(isSendable({ type: "weapon" }, "JournalEntry"), false);
  assert.equal(isSendable(null, "Actor"), false);
});

test("sentFlag keeps the previous portraitFileId and names the document", () => {
  const result = { kind: "loot", fileId: 41, folderId: 7, created: 3, updated: 0, synced: false };
  assert.deepEqual(sentFlag(result, link, { fileId: 30, portraitFileId: 31 }, "Actor.lootActor0000001"),
    { fileId: 41, projectId: 12, type: "loot", portraitFileId: 31, documentUuid: "Actor.lootActor0000001" });
  assert.deepEqual(sentFlag(result, link, null, "Actor.lootActor0000001"),
    { fileId: 41, projectId: 12, type: "loot", portraitFileId: null, documentUuid: "Actor.lootActor0000001" });
});

test("i4 a duplicate that copied the sheet flag is not sent onto the original's sheet", () => {
  const duplicate = lootActor();
  duplicate.flags[MODULE].sheet.documentUuid = "Actor.lootActor0000001";
  const flag = duplicate.flags[MODULE].sheet;

  assert.equal(ownsSheetFlag(flag, "Actor.lootActor0000001"), true);
  assert.equal(ownsSheetFlag(flag, "Actor.copyOfChest00001"), false);
  assert.equal(ownsSheetFlag({ fileId: 30 }, "Actor.copyOfChest00001"), true);
  assert.equal(ownsSheetFlag(null, "Actor.copyOfChest00001"), false);
  const body = sendBody(duplicate, { documentName: "Actor", uuid: "Actor.copyOfChest00001", fileId: null });
  assert.equal(body.organizr, undefined);
});

function copy(uuid, createdTime, sheet = { fileId: 30, projectId: 12, type: "loot" }) {
  const stats = createdTime === undefined ? {} : { createdTime };
  return { uuid, flags: { [MODULE]: { sheet: { ...sheet } } }, _stats: stats };
}

const ORIGINAL = "Actor.lootActor0000001";
const DUPLICATE = "Actor.copyOfChest00001";

test("legacy flag on the only copy owns it", () => {
  const original = copy(ORIGINAL, 100);
  assert.equal(needsRecordedUuid(legacyFlagCandidates(original, [original])), false);
  assert.equal(needsRecordedUuid(legacyFlagCandidates(original, [])), false);
  assert.equal(ownsSheetFlagAmong(original, [original], null), true);
  assert.equal(ownsSheetFlagAmong(original, [], null), true);
});

test("a legacy copy beside other files or companions still owns its flag alone", () => {
  const original = copy(ORIGINAL, 100);
  const otherFile = copy("Actor.otherChest000001", 50, { fileId: 31 });
  const companion = copy("Item.companion0000001", 10);
  companion.flags[MODULE].companion = { fileId: 30, label: "Action: Spark" };
  const candidates = legacyFlagCandidates(original, [original, otherFile, companion]);
  assert.deepEqual(candidates.map((entry) => entry.uuid), [ORIGINAL]);
  assert.equal(ownsSheetFlagAmong(original, [original, otherFile, companion], null), true);
});

test("a stamped copy owns a legacy flag over its duplicates", () => {
  const stamped = copy("Actor.stampedChest0001", 300, { fileId: 30, documentUuid: "Actor.stampedChest0001" });
  const legacy = copy(DUPLICATE, 100);
  const copies = [stamped, legacy];
  assert.deepEqual(legacyFlagCandidates(legacy, copies), []);
  assert.equal(needsRecordedUuid(legacyFlagCandidates(legacy, copies)), false);
  assert.equal(ownsSheetFlagAmong(legacy, copies, DUPLICATE), false);
  assert.equal(ownsSheetFlagAmong(stamped, copies, null), true);
});

test("the recorded uuid picks the owner among legacy copies", () => {
  const original = copy(ORIGINAL, 100);
  const duplicate = copy(DUPLICATE, 200);
  const copies = [original, duplicate];
  assert.equal(needsRecordedUuid(legacyFlagCandidates(duplicate, copies)), true);
  assert.equal(ownsSheetFlagAmong(duplicate, copies, DUPLICATE), true);
  assert.equal(ownsSheetFlagAmong(original, copies, DUPLICATE), false);
  assert.equal(ownsSheetFlagAmong(original, copies, ORIGINAL), true);
  assert.equal(ownsSheetFlagAmong(duplicate, copies, ORIGINAL), false);
});

test("without a recorded uuid the oldest legacy copy owns", () => {
  const original = copy(ORIGINAL, 100);
  const duplicate = copy(DUPLICATE, 200);
  const copies = [duplicate, original];
  assert.equal(ownsSheetFlagAmong(original, copies, null), true);
  assert.equal(ownsSheetFlagAmong(duplicate, copies, null), false);
  assert.equal(ownsSheetFlagAmong(original, copies, "Actor.goneChest000001"), true);
  assert.equal(ownsSheetFlagAmong(duplicate, copies, "Actor.goneChest000001"), false);

  const undated = copy("Actor.undatedChest0001");
  assert.equal(ownsSheetFlagAmong(undated, [undated, duplicate], null), false);
  assert.equal(ownsSheetFlagAmong(duplicate, [undated, duplicate], null), true);
});

test("a legacy document outside the world list joins its copies, so a dragged-in item is a copy", () => {
  const worldItem = copy("Item.ringOfSparks0001", 100, { fileId: 30, type: "item" });
  const embedded = copy("Actor.a.Item.ringOfSparks0002", 200, { fileId: 30, type: "item" });
  assert.deepEqual(legacyFlagCandidates(embedded, [worldItem]).map((entry) => entry.uuid),
    ["Item.ringOfSparks0001", "Actor.a.Item.ringOfSparks0002"]);
  assert.equal(ownsSheetFlagAmong(embedded, [worldItem], null), false);
});

test("copies stamped with another uuid do not compete for a legacy flag", () => {
  const legacy = copy(ORIGINAL, 200);
  const stampedDuplicate = copy(DUPLICATE, 100, { fileId: 30, documentUuid: "Actor.goneChest000001" });
  const copies = [legacy, stampedDuplicate];
  assert.deepEqual(legacyFlagCandidates(legacy, copies).map((entry) => entry.uuid), [ORIGINAL]);
  assert.equal(ownsSheetFlagAmong(legacy, copies, null), true);
  assert.equal(ownsSheetFlagAmong(stampedDuplicate, copies, null), false);
});

test("stamped flags keep the stamped rule among copies", () => {
  const original = copy(ORIGINAL, 100, { fileId: 30, documentUuid: ORIGINAL });
  const duplicate = copy(DUPLICATE, 200, { fileId: 30, documentUuid: ORIGINAL });
  assert.equal(ownsSheetFlagAmong(original, [original, duplicate], DUPLICATE), true);
  assert.equal(ownsSheetFlagAmong(duplicate, [original, duplicate], DUPLICATE), false);
  assert.equal(ownsSheetFlagAmong({ uuid: ORIGINAL, flags: {} }, [], null), false);
});

test("recordedUuidOf finds the row by file id", () => {
  const rows = [
    { fileId: 29, uuid: "Actor.otherChest000001" },
    { fileId: 30, uuid: ORIGINAL },
    { fileId: 32, uuid: null }
  ];
  assert.equal(recordedUuidOf(rows, 30), ORIGINAL);
  assert.equal(recordedUuidOf(rows, "30"), ORIGINAL);
  assert.equal(recordedUuidOf([{ fileId: "30", uuid: ORIGINAL }], 30), ORIGINAL);
  assert.equal(recordedUuidOf(rows, 31), null);
  assert.equal(recordedUuidOf(rows, 32), null);
  assert.equal(recordedUuidOf(null, 30), null);
  assert.equal(recordedUuidOf({ fileId: 30, uuid: ORIGINAL }, 30), null);
});

test("i9 companion action items are not sendable", () => {
  const companion = { type: "action", system: {}, flags: { [MODULE]: { companion: { fileId: 30, label: "Action: Spark" } } } };
  assert.equal(isSendable(companion, "Item"), false);
  assert.equal(isSendable({ type: "action", system: {}, flags: {} }, "Item"), true);
});

test("outcome keys distinguish created from synced and summarize dropped lines", () => {
  const created = sendOutcome({ kind: "npc", fileId: 1, created: 4, updated: 0, synced: false, notes: ["n1"], dropped: [] });
  assert.equal(created.key, "ORGANIZR.Send.Created");
  assert.deepEqual(created.data, { kind: "npc", created: 4, updated: 0 });
  assert.deepEqual(created.notes, ["n1"]);
  assert.equal(created.droppedSummary, null);

  const synced = sendOutcome({ kind: "loot", synced: true, dropped: ["2 rule elements: Aura, FlatModifier", "material: cold iron", "container: Satchel"] });
  assert.equal(synced.key, "ORGANIZR.Send.Updated");
  assert.deepEqual(synced.data, { kind: "loot", created: 0, updated: 0 });
  assert.deepEqual(synced.droppedSummary, { count: 3, first: "2 rule elements: Aura, FlatModifier; material: cold iron" });
  assert.equal(synced.dropped.length, 3);
  assert.deepEqual(synced.notes, []);
});

test("send error keys by status", () => {
  assert.equal(sendErrorKey(0), "ORGANIZR.Send.Errors.Unreachable");
  assert.equal(sendErrorKey(401), "ORGANIZR.Send.Errors.TokenRejected");
  assert.equal(sendErrorKey(403), "ORGANIZR.Send.Errors.WrongProject");
  assert.equal(sendErrorKey(404), "ORGANIZR.Send.Errors.ProjectNotFound");
  assert.equal(sendErrorKey(400), "ORGANIZR.Send.Errors.Refused");
  assert.equal(sendErrorKey(422), "ORGANIZR.Send.Errors.Refused");
  assert.equal(sendErrorKey(500), "ORGANIZR.Send.Errors.ServerError");
  assert.equal(sendErrorKey(-1), "ORGANIZR.Send.Errors.ServerError");
});

test("bodies over 5 MB do not fit the send limit", () => {
  assert.equal(fitsSendLimit({ name: "small" }), true);
  assert.equal(fitsSendLimit({ text: "x".repeat(5 * 1024 * 1024) }), false);
  assert.equal(fitsSendLimit({ text: "ä".repeat(3 * 1024 * 1024) }), false);
});

test("f4 a copy's body carries no sheet flag pointing at the original's file", () => {
  const stampedCopy = lootActor();
  stampedCopy.flags[MODULE].sheet.documentUuid = ORIGINAL;
  stampedCopy.flags[MODULE].note = "kept";
  const stampedBody = sendBody(stampedCopy, { documentName: "Actor", uuid: DUPLICATE, fileId: null });
  assert.equal(stampedBody.organizr, undefined);
  assert.equal(stampedBody.flags[MODULE].sheet, undefined);
  assert.equal(stampedBody.flags[MODULE].note, "kept");
  assert.equal(stampedCopy.flags[MODULE].sheet.fileId, 30);

  const legacyCopy = lootActor();
  const legacyBody = sendBody(legacyCopy, { documentName: "Actor", uuid: DUPLICATE, fileId: null });
  assert.equal(legacyBody.flags[MODULE].sheet, undefined);
  assert.equal(legacyCopy.flags[MODULE].sheet.fileId, 30);
});

test("f4 the owner's body keeps its sheet flag beside the organizr block", () => {
  const owner = lootActor();
  const body = sendBody(owner, { documentName: "Actor", uuid: ORIGINAL, fileId: 30 });
  assert.deepEqual(body.organizr, { fileId: 30 });
  assert.deepEqual(body.flags[MODULE].sheet, owner.flags[MODULE].sheet);
});

test("f4 exactly one undated legacy copy owns, whichever is sent", () => {
  const first = copy(ORIGINAL);
  const second = copy(DUPLICATE);
  const copies = [first, second];
  for (const recorded of [null, "Actor.goneChest000001"]) {
    const owners = copies.filter((sent) => ownsSheetFlagAmong(sent, copies, recorded));
    assert.deepEqual(owners.map((owner) => owner.uuid), [ORIGINAL]);
  }
});

test("f4 exactly one legacy copy owns on equal createdTime, whichever is sent", () => {
  const first = copy(ORIGINAL, 100);
  const second = copy(DUPLICATE, 100);
  const copies = [first, second];
  const owners = copies.filter((sent) => ownsSheetFlagAmong(sent, copies, null));
  assert.deepEqual(owners.map((owner) => owner.uuid), [ORIGINAL]);
});

test("f4 the sent copy keeps its world place among the candidates", () => {
  const first = copy(ORIGINAL, 100);
  const second = copy(DUPLICATE, 200);
  assert.deepEqual(legacyFlagCandidates(second, [first, second]).map((entry) => entry.uuid), [ORIGINAL, DUPLICATE]);
  assert.deepEqual(legacyFlagCandidates(first, [first, second]).map((entry) => entry.uuid), [ORIGINAL, DUPLICATE]);
});

test("pf1 loot and container items are sendable only in a pf1 world", () => {
  for (const type of ["loot", "container"]) {
    assert.equal(isSendable({ type, system: {} }, "Item", "pf1"), true, type);
    assert.equal(isSendable({ type, system: {} }, "Item", "pf2e"), false, type);
    assert.equal(isSendable({ type, system: {} }, "Item", "dnd5e"), false, type);
    assert.equal(isSendable({ type, system: {} }, "Item"), false, type);
  }
  assert.equal(isSendable({ type: "container", pack: "pf1.items" }, "Item", "pf1"), false);
});

test("pf1 attacks, buffs, classes and races stay unsendable; the shared kinds stay sendable in a pf1 world", () => {
  for (const type of ["attack", "buff", "class", "race", "implant"]) {
    assert.equal(isSendable({ type, system: {} }, "Item", "pf1"), false, type);
  }
  for (const type of ["spell", "feat", "weapon", "equipment", "consumable"]) {
    assert.equal(isSendable({ type, system: {} }, "Item", "pf1"), true, type);
  }
  assert.equal(isSendable({ type: "npc" }, "Actor", "pf1"), true);
  assert.equal(isSendable({ type: "character" }, "Actor", "pf1"), false);
  assert.equal(isSendable({ type: "haunt" }, "Actor", "pf1"), false);
});

test("derivedTotals reach the body only when given, as a copy", () => {
  const data = { _id: "npcActor00000001", name: "Fen Lurker", type: "npc", system: {}, items: [] };
  const derivedTotals = { ac: 17, touchAc: 11, flatFootedAc: 16, hp: 22, bab: 3, cmb: 5, cmd: 16, init: 1, fort: 4, ref: 2, will: 1, skills: { per: 7 } };
  const body = sendBody(data, { documentName: "Actor", uuid: "Actor.npcActor00000001", derivedTotals });
  assert.deepEqual(body.derivedTotals, derivedTotals);
  body.derivedTotals.skills.per = 0;
  assert.equal(derivedTotals.skills.per, 7);

  const without = sendBody(data, { documentName: "Actor", uuid: "Actor.npcActor00000001" });
  assert.equal("derivedTotals" in without, false);
  const withNull = sendBody(data, { documentName: "Actor", uuid: "Actor.npcActor00000001", derivedTotals: null });
  assert.equal("derivedTotals" in withNull, false);
});
