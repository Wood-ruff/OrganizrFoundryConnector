import { test } from "node:test";
import assert from "node:assert/strict";
import {
  documentKind, importErrorKey, isImportable, linkBody, linkedIndex, portraitFileName, sheetFlag, withPortrait,
  withRequestedFileId
} from "../scripts/service/SheetImport.mjs";

const documentTypes = { Actor: ["character", "npc", "loot"], Item: ["weapon", "spell", "action"] };

test("only NPC, item, spell, action and loot sheets are importable", () => {
  for (const type of ["npc", "item", "spell", "action", "loot"]) assert.equal(isImportable(type), true);
  assert.equal(isImportable("character"), false);
  assert.equal(isImportable("status"), false);
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

test("linkedIndex maps file ids to the documents carrying the flag", () => {
  const a = { name: "A", flags: { "organizr-foundry-connector": { sheet: { fileId: 5 } } } };
  const b = { name: "B", flags: { "organizr-foundry-connector": { sync: { characterFileId: 9 } } } };
  const index = linkedIndex([a, b, { name: "C" }]);
  assert.equal(index.size, 1);
  assert.equal(index.get("5"), a);
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

test("withPortrait sets img and the prototype token image unless the token has its own", () => {
  const actor = { name: "Goblin", img: "icons/svg/mystery-man.svg", prototypeToken: { name: "Goblin", texture: { src: "icons/svg/mystery-man.svg", scaleX: 1 } } };
  const stored = withPortrait(actor, "worlds/w/organizr-portraits/5.png");
  assert.equal(stored.img, "worlds/w/organizr-portraits/5.png");
  assert.deepEqual(stored.prototypeToken.texture, { src: "worlds/w/organizr-portraits/5.png", scaleX: 1 });
  assert.equal(actor.img, "icons/svg/mystery-man.svg");

  const custom = withPortrait({ prototypeToken: { texture: { src: "tokens/goblin.webp" } } }, "p.png");
  assert.equal(custom.prototypeToken.texture.src, "tokens/goblin.webp");

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
