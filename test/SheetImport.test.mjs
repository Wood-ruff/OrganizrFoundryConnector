import { test } from "node:test";
import assert from "node:assert/strict";
import {
  appliesPortrait, documentKind, importErrorKey, isImportable, linkBody, linkedIndex, pickLinked, portraitFileName,
  sheetFlag, withDocumentUuid, withPortrait, withRequestedFileId
} from "../scripts/service/SheetImport.mjs";

const documentTypes = { Actor: ["character", "npc", "loot"], Item: ["weapon", "spell", "action"] };

test("NPC, item, spell, action and loot sheets are importable in every system, characters only in pf1e", () => {
  for (const type of ["npc", "item", "spell", "action", "loot"]) {
    assert.equal(isImportable(type), true);
    assert.equal(isImportable(type, "pf2e"), true);
  }
  assert.equal(isImportable("character", "pf1e"), true);
  assert.equal(isImportable("character", "pf2e"), false);
  assert.equal(isImportable("character", ""), false);
  assert.equal(isImportable("character"), false);
  assert.equal(isImportable("status", "pf1e"), false);
  assert.equal(isImportable(undefined), false);
});

test("sheetFlag reads the module's sheet flag and tolerates missing flags", () => {
  const flagged = { flags: { "organizr-foundry-connector": { sheet: { fileId: 5, projectId: 1, type: "npc", portraitFileId: null } } } };
  assert.deepEqual(sheetFlag(flagged), { fileId: 5, projectId: 1, type: "npc", portraitFileId: null });
  assert.equal(sheetFlag({}), null);
  assert.equal(sheetFlag(null), null);
});

test("documentKind picks Actor or Item from the world's registered sub-types", () => {
  assert.equal(documentKind({ type: "npc" }, documentTypes), "Actor");
  assert.equal(documentKind({ type: "spell" }, documentTypes), "Item");
  assert.equal(documentKind({ type: "vehicle" }, documentTypes), null);
  assert.equal(documentKind(null, documentTypes), null);
  assert.equal(documentKind({ type: "npc" }, undefined), null);
});

test("linkedIndex lists all copies per file id and skips companions", () => {
  const a = { name: "A", flags: { "organizr-foundry-connector": { sheet: { fileId: 5 } } } };
  const copy = { name: "A copy", flags: { "organizr-foundry-connector": { sheet: { fileId: 5 } } } };
  const b = { name: "B", flags: { "organizr-foundry-connector": { sync: { characterFileId: 9 } } } };
  const companion = { name: "Zap", flags: { "organizr-foundry-connector": { sheet: { fileId: 5 }, companion: { fileId: 5, label: "Action: Zap" } } } };
  const index = linkedIndex([a, b, copy, companion, { name: "C" }]);
  assert.equal(index.size, 2);
  assert.deepEqual(index.get("5"), [a, copy]);
  assert.equal(index.get("5")[0], a);
  assert.deepEqual(index.get("9"), [b]);
});

test("a character pushed to Organizr counts as linked to its file; the sheet flag wins over the sync flag", () => {
  const pushed = { name: "Pushed", flags: { "organizr-foundry-connector": { sync: { characterFileId: 7, documentUuid: "Actor.P1" } } } };
  const both = { name: "Both", flags: { "organizr-foundry-connector": { sheet: { fileId: 8 }, sync: { characterFileId: 3 } } } };
  const unsynced = { name: "Unsynced", flags: { "organizr-foundry-connector": { sync: { characterFileId: null } } } };
  const index = linkedIndex([pushed, both, unsynced]);
  assert.deepEqual([...index.keys()], ["7", "8"]);
  assert.deepEqual(index.get("7"), [pushed]);
  assert.deepEqual(index.get("8"), [both]);
});

test("spellsActions14 pickLinked prefers the recorded uuid, else the oldest, and counts duplicates", () => {
  const original = { uuid: "Item.A", _stats: { createdTime: 100 } };
  const clone = { uuid: "Item.B", _stats: { createdTime: 200 } };
  const undated = { uuid: "Item.C" };
  assert.deepEqual(pickLinked([clone, original], "Item.B"), { target: clone, duplicates: 1 });
  assert.deepEqual(pickLinked([clone, undated, original], "Item.Z"), { target: original, duplicates: 2 });
  assert.deepEqual(pickLinked([undated, clone], null), { target: clone, duplicates: 1 });
  assert.deepEqual(pickLinked([undated], null), { target: undated, duplicates: 0 });
  assert.deepEqual(pickLinked([], "Item.A"), { target: null, duplicates: 0 });
  assert.deepEqual(pickLinked(undefined, null), { target: null, duplicates: 0 });
});

test("items11 portrait only for actors with a default img", () => {
  assert.equal(appliesPortrait("Actor", { type: "npc", img: "systems/pf2e/icons/default-icons/npc.svg" }), true);
  assert.equal(appliesPortrait("Actor", { type: "npc", img: "icons/svg/mystery-man.svg" }), true);
  assert.equal(appliesPortrait("Actor", { type: "npc", img: "" }), true);
  assert.equal(appliesPortrait("Actor", { type: "npc" }), true);
  assert.equal(appliesPortrait("Actor", { type: "loot", img: "icons/containers/chest/chest-wooden-tied-white.webp" }), false);
  assert.equal(appliesPortrait("Item", { type: "equipment", img: "systems/pf2e/icons/default-icons/equipment.svg" }), false);
  assert.equal(appliesPortrait("Item", { type: "spell", img: "" }), false);
});

test("portrait file names follow the media type; unknown types give null", () => {
  assert.equal(portraitFileName(5, "image/png"), "5.png");
  assert.equal(portraitFileName(5, "image/jpeg; charset=binary"), "5.jpg");
  assert.equal(portraitFileName(5, "image/webp"), "5.webp");
  assert.equal(portraitFileName(5, "application/pdf"), null);
  assert.equal(portraitFileName(5, undefined), null);
});

test("portrait file names refuse ids that are not plain numbers", () => {
  assert.equal(portraitFileName("../x", "image/png"), null);
  assert.equal(portraitFileName("5/../../x", "image/png"), null);
  assert.equal(portraitFileName("", "image/png"), null);
  assert.equal(portraitFileName(null, "image/png"), null);
  assert.equal(portraitFileName("12", "image/png"), "12.png");
});

test("withRequestedFileId stamps the requested id into the sheet flag without touching other flags", () => {
  const payload = { name: "Goblin", flags: { "organizr-foundry-connector": { sheet: { fileId: 999, type: "npc" } }, core: { sourceId: "x" } } };
  const stamped = withRequestedFileId(payload, "5");
  assert.deepEqual(stamped.flags["organizr-foundry-connector"].sheet, { fileId: 5, type: "npc" });
  assert.deepEqual(stamped.flags.core, { sourceId: "x" });
  assert.equal(payload.flags["organizr-foundry-connector"].sheet.fileId, 999);

  const bare = withRequestedFileId({ name: "Sword" }, 7);
  assert.deepEqual(bare.flags, { "organizr-foundry-connector": { sheet: { fileId: 7 } } });
});

test("withPortrait follow rule: the token follows when empty, the mystery man or the pre-portrait img", () => {
  const actor = { name: "Goblin", img: "icons/svg/mystery-man.svg", prototypeToken: { name: "Goblin", texture: { src: "icons/svg/mystery-man.svg", scaleX: 1 } } };
  const stored = withPortrait(actor, "worlds/w/organizr-portraits/5.png");
  assert.equal(stored.img, "worlds/w/organizr-portraits/5.png");
  assert.deepEqual(stored.prototypeToken.texture, { src: "worlds/w/organizr-portraits/5.png", scaleX: 1 });
  assert.equal(actor.img, "icons/svg/mystery-man.svg");

  const custom = withPortrait({ prototypeToken: { texture: { src: "tokens/goblin.webp" } } }, "p.png");
  assert.equal(custom.prototypeToken.texture.src, "tokens/goblin.webp");

  const following = withPortrait({ img: "worlds/w/organizr-portraits/5.png", prototypeToken: { texture: { src: "worlds/w/organizr-portraits/5.png" } } }, "worlds/w/organizr-portraits/5.webp");
  assert.equal(following.prototypeToken.texture.src, "worlds/w/organizr-portraits/5.webp");

  const empty = withPortrait({ img: "systems/pf2e/icons/default-icons/npc.svg", prototypeToken: { texture: {} } }, "p.png");
  assert.equal(empty.prototypeToken.texture.src, "p.png");

  const item = withPortrait({ name: "Sword", type: "weapon" }, "p.png");
  assert.equal(item.img, "p.png");
  assert.equal("prototypeToken" in item, false);
});

test("link body and error keys", () => {
  assert.deepEqual(linkBody("Actor.Ab12", "my-world"), { uuid: "Actor.Ab12", worldId: "my-world" });
  assert.equal(importErrorKey(0), "ORGANIZR.Browser.Errors.Unreachable");
  assert.equal(importErrorKey(401), "ORGANIZR.Browser.Errors.TokenRejected");
  assert.equal(importErrorKey(403), "ORGANIZR.Browser.Errors.Forbidden");
  assert.equal(importErrorKey(404), "ORGANIZR.Browser.Errors.SheetMissing");
  assert.equal(importErrorKey(422), "ORGANIZR.Browser.Errors.ImportRefused");
  assert.equal(importErrorKey(-1), "ORGANIZR.Browser.Errors.ImportRefused");
});

test("i4 withDocumentUuid names the document in a copy of the sheet flag", () => {
  const flag = { fileId: 30, projectId: 12, type: "npc", portraitFileId: null };
  assert.deepEqual(withDocumentUuid(flag, "Actor.npcActor00000001"), { ...flag, documentUuid: "Actor.npcActor00000001" });
  assert.equal(flag.documentUuid, undefined);
});
