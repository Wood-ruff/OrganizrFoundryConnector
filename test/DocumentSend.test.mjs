import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fitsSendLimit, isSendable, ownsSheetFlag, sendBody, sendErrorKey, sendOutcome, sentFlag
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
