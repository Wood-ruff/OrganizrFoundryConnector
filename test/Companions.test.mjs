import { test } from "node:test";
import assert from "node:assert/strict";
import {
  companionData, companionFlag, companionFolderData, isCompanionFolderOf, isCompanionOf, splitPayload
} from "../scripts/service/Companions.mjs";

const MODULE = "organizr-foundry-connector";

function sparkCompanion() {
  return {
    label: "Action: Spark Jolt (Ring of Sparks)",
    ownerName: "Ring of Sparks",
    document: {
      name: "Spark Jolt",
      type: "action",
      system: { actionType: { value: "action" } },
      flags: { core: { a: 1 }, [MODULE]: { sheet: { fileId: 40, type: "action" } } }
    }
  };
}

test("loot3 items5 splitPayload accepts the wrapped and the bare shape", () => {
  const wrapped = { document: { name: "Mossy Chest", type: "loot", system: {} }, companions: [sparkCompanion()] };
  const split = splitPayload(wrapped);
  assert.equal(split.document, wrapped.document);
  assert.equal(split.companions.length, 1);

  const bare = { name: "Mossy Chest", type: "loot", system: {} };
  assert.deepEqual(splitPayload(bare), { document: bare, companions: [] });

  const withoutList = { document: { name: "X", type: "npc" } };
  assert.deepEqual(splitPayload(withoutList).companions, []);
  assert.deepEqual(splitPayload(null), { document: {}, companions: [] });
});

test("splitPayload drops companions without label or document", () => {
  const payload = { document: { name: "X" }, companions: [sparkCompanion(), { label: "broken" }, { document: {} }, null] };
  assert.equal(splitPayload(payload).companions.length, 1);
});

test("a bare document that has a document field in its system data is not mistaken for the wrapper", () => {
  const bare = { name: "Odd", type: "book", system: {}, document: { name: "inner" } };
  assert.equal(splitPayload(bare).document, bare);
});

test("loot3 items5 companionData sets the flag and strips sheet", () => {
  const companion = sparkCompanion();
  const data = companionData(companion, "30");
  assert.deepEqual(data.flags[MODULE], { companion: { fileId: 30, label: "Action: Spark Jolt (Ring of Sparks)" } });
  assert.deepEqual(data.flags.core, { a: 1 });
  assert.equal(data.name, "Spark Jolt");
  assert.deepEqual(companion.document.flags[MODULE].sheet, { fileId: 40, type: "action" });
  assert.deepEqual(companionFlag(data), { fileId: 30, label: "Action: Spark Jolt (Ring of Sparks)" });
});

test("companionData works without any flags", () => {
  const data = companionData({ label: "Action: Mend", document: { name: "Mend", type: "action" } }, 7);
  assert.deepEqual(data.flags, { [MODULE]: { companion: { fileId: 7, label: "Action: Mend" } } });
});

test("loot3 items5 companions match by owner file id and label", () => {
  const data = companionData(sparkCompanion(), 30);
  assert.equal(isCompanionOf(data, 30, "Action: Spark Jolt (Ring of Sparks)"), true);
  assert.equal(isCompanionOf(data, "30", "Action: Spark Jolt (Ring of Sparks)"), true);
  assert.equal(isCompanionOf(data, 31, "Action: Spark Jolt (Ring of Sparks)"), false);
  assert.equal(isCompanionOf(data, 30, "Action: Other"), false);
  assert.equal(isCompanionOf({ flags: {} }, 30, "Action: Spark Jolt (Ring of Sparks)"), false);
  assert.equal(companionFlag(null), null);
});

test("the companion folder is an Item folder flagged with the owner sheet", () => {
  const folder = companionFolderData("Mossy Chest", "30");
  assert.deepEqual(folder, { name: "Mossy Chest", type: "Item", flags: { [MODULE]: { companionsOf: 30 } } });
  assert.equal(isCompanionFolderOf(folder, 30), true);
  assert.equal(isCompanionFolderOf(folder, "30"), true);
  assert.equal(isCompanionFolderOf(folder, 31), false);
  assert.equal(isCompanionFolderOf({ ...folder, type: "Actor" }, 30), false);
  assert.equal(isCompanionFolderOf({ type: "Item", flags: {} }, 30), false);
  assert.equal(isCompanionFolderOf(null, 30), false);
});
