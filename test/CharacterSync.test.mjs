import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { flaggedFileId, isCopiedActor, knownFileId, syncBody, syncErrorKey, syncFlag, syncOutcome } from "../scripts/service/CharacterSync.mjs";

const world = { id: "w", coreVersion: "14.369", systemId: "pf2e", systemVersion: "8.6.0" };

function actor(items, exportedItems) {
  return {
    id: "A1", uuid: "Actor.A1", name: "Mara", documentName: "Actor",
    items: { contents: items },
    toCompendium: () => ({ name: "Mara", type: "character", items: exportedItems, _stats: {} })
  };
}

test("sync body carries the actor uuid and item uuids matched by id", () => {
  const body = syncBody(actor(
    [{ id: "i1", uuid: "Actor.A1.Item.i1" }, { id: "i2", uuid: "Actor.A1.Item.i2" }],
    [{ _id: "i2", name: "Sword" }, { _id: "i1", name: "Shield" }]
  ), world);

  assert.equal(body.uuid, "Actor.A1");
  assert.deepEqual(body.items.map((i) => i.uuid), ["Actor.A1.Item.i2", "Actor.A1.Item.i1"]);
  assert.equal(body._stats.exportSource.uuid, "Actor.A1");
});

test("items without an id fall back to their position; unknown items get no uuid", () => {
  const body = syncBody(actor(
    [{ id: "i1", uuid: "Actor.A1.Item.i1" }],
    [{ name: "Nameless" }, { _id: "zzz", name: "Stranger" }]
  ), world);
  assert.equal(body.items[0].uuid, "Actor.A1.Item.i1");
  assert.equal("uuid" in body.items[1], false);
});

test("the body names the Organizr file when the actor carries a sheet or sync flag", () => {
  const plain = syncBody(actor([], []), world);
  assert.equal("organizr" in plain, false);

  const imported = syncBody({ ...actor([], []), flags: { "organizr-foundry-connector": { sheet: { fileId: 5 } } } }, world);
  assert.deepEqual(imported.organizr, { fileId: 5 });

  const pushed = syncBody({ ...actor([], []), flags: { "organizr-foundry-connector": { sync: { characterFileId: 9 } } } }, world);
  assert.deepEqual(pushed.organizr, { fileId: 9 });
});

test("an actor without items yields an empty item list", () => {
  const body = syncBody({ ...actor([], undefined), items: undefined }, world);
  assert.deepEqual(body.items, []);
});

test("sync body localizes custom resistance labels when a localizer is given", () => {
  const key = "PF2E.SpecificRule.Equipment.ChannelProtectionAmuletLabel";
  const exported = [{ _id: "i1", name: "Amulet", system: { rules: [{ key: "Resistance", type: "custom", value: 5, label: key }] } }];
  const items = [{ id: "i1", uuid: "Actor.A1.Item.i1" }];
  const localize = (k) => (k === key ? "Channel Protection" : k);

  const localized = syncBody(actor(items, exported), world, localize);
  assert.equal(localized.items[0].system.rules[0].label, "Channel Protection");
  assert.equal(localized.items[0].uuid, "Actor.A1.Item.i1");

  const raw = syncBody(actor(items, exported), world);
  assert.equal(raw.items[0].system.rules[0].label, key);
});

test("sync flag remembers the Organizr file, where it was pushed and the actor it belongs to", () => {
  const flag = syncFlag({ characterFileId: 7, folderId: 3 }, { serverUrl: "https://o", projectId: "12", apiToken: "org_x" }, "2026-10-16T12:00:00Z", "Actor.A1");
  assert.deepEqual(flag, {
    characterFileId: 7, folderId: 3, serverUrl: "https://o", projectId: "12", syncedAt: "2026-10-16T12:00:00Z", documentUuid: "Actor.A1"
  });
});

function flagged(uuid, moduleFlags) {
  return { ...actor([], []), id: uuid.slice("Actor.".length), uuid, flags: { "organizr-foundry-connector": moduleFlags } };
}

test("a duplicated actor carrying another actor's stamped flags pushes without a file id", () => {
  const copiedFlags = {
    sheet: { fileId: 5, documentUuid: "Actor.A1" },
    sync: { characterFileId: 9, documentUuid: "Actor.A1" }
  };
  const original = flagged("Actor.A1", copiedFlags);
  const copy = flagged("Actor.B2", copiedFlags);

  assert.deepEqual(syncBody(original, world).organizr, { fileId: 5 });
  assert.equal("organizr" in syncBody(copy, world), false);
  assert.equal(isCopiedActor(copy), true);
  assert.equal(isCopiedActor(original), false);
});

test("legacy flags without documentUuid still belong to the actor", () => {
  assert.equal(knownFileId(flagged("Actor.B2", { sheet: { fileId: 5 } })), 5);
  assert.equal(knownFileId(flagged("Actor.B2", { sync: { characterFileId: 9 } })), 9);
  assert.equal(isCopiedActor(flagged("Actor.B2", { sync: { characterFileId: 9 } })), false);
});

test("a copied sheet flag falls back to the actor's own sync flag", () => {
  const copy = flagged("Actor.B2", {
    sheet: { fileId: 5, documentUuid: "Actor.A1" },
    sync: { characterFileId: 12, documentUuid: "Actor.B2" }
  });
  assert.equal(knownFileId(copy), 12);
  assert.equal(isCopiedActor(copy), false);
});

test("a token actor answers for its base actor's stamped flag", () => {
  const moduleFlags = { sheet: { fileId: 5, documentUuid: "Actor.A1" } };
  const tokenActor = { ...flagged("Actor.A1", moduleFlags), uuid: "Scene.S.Token.t1.Actor.A1", isToken: true };
  assert.equal(knownFileId(tokenActor), 5);
  const withBase = { ...tokenActor, token: { baseActor: { uuid: "Actor.A1" } } };
  assert.equal(knownFileId(withBase), 5);
  const ofCopy = { ...tokenActor, id: "B2", uuid: "Scene.S.Token.t2.Actor.B2" };
  assert.equal(knownFileId(ofCopy), null);
});

test("an actor without module flags is no copy", () => {
  assert.equal(isCopiedActor(actor([], [])), false);
  assert.equal(knownFileId(actor([], [])), null);
});

test("outcome distinguishes created from re-synced and counts notes", () => {
  const created = syncOutcome({ synced: false, created: 5, updated: 0, notes: ["a", "b"] });
  assert.equal(created.key, "ORGANIZR.Characters.SyncCreated");
  assert.deepEqual(created.data, { created: 5, updated: 0, notes: 2 });
  assert.deepEqual(created.notes, ["a", "b"]);

  const updated = syncOutcome({ synced: true });
  assert.equal(updated.key, "ORGANIZR.Characters.SyncUpdated");
  assert.deepEqual(updated.data, { created: 0, updated: 0, notes: 0 });
});

test("error keys by status", () => {
  assert.equal(syncErrorKey(0), "ORGANIZR.Characters.Errors.Unreachable");
  assert.equal(syncErrorKey(401), "ORGANIZR.Characters.Errors.TokenRejected");
  assert.equal(syncErrorKey(403), "ORGANIZR.Characters.Errors.WrongProject");
  assert.equal(syncErrorKey(404), "ORGANIZR.Characters.Errors.ProjectNotFound");
  assert.equal(syncErrorKey(400), "ORGANIZR.Characters.Errors.ServerError");
  assert.equal(syncErrorKey(500), "ORGANIZR.Characters.Errors.ServerError");
});

function pf1Character(system) {
  return { ...actor([], []), type: "character", system };
}

const pf1World = { id: "w1", coreVersion: "13.351", systemId: "pf1", systemVersion: "11.11" };

test("a pf1 character's push body carries the totals pf1 prepared", () => {
  const system = JSON.parse(readFileSync(new URL("fixtures/pf1-character-system.json", import.meta.url), "utf8"));
  const totals = JSON.parse(readFileSync(new URL("fixtures/pf1-character-totals.json", import.meta.url), "utf8"));

  const body = syncBody(pf1Character(system), pf1World);

  assert.deepEqual(body.derivedTotals, totals);
  assert.equal(body.uuid, "Actor.A1");
});

test("a pf2e character and a pf1 character without numeric totals push without derivedTotals", () => {
  const system = JSON.parse(readFileSync(new URL("fixtures/pf1-character-system.json", import.meta.url), "utf8"));
  assert.equal("derivedTotals" in syncBody(pf1Character(system), world), false);
  assert.equal("derivedTotals" in syncBody(pf1Character({ attributes: {} }), pf1World), false);
  assert.equal("derivedTotals" in syncBody(actor([], []), world), false);
});

test("std8 flaggedFileId reads the sheet flag's file, else the sync flag's, whoever owns them", () => {
  const copied = { sheet: { fileId: 5, documentUuid: "Actor.A1" }, sync: { characterFileId: 9, documentUuid: "Actor.A1" } };
  assert.equal(flaggedFileId(flagged("Actor.B2", copied)), 5);
  assert.equal(flaggedFileId(flagged("Actor.B2", { sync: { characterFileId: 9, documentUuid: "Actor.A1" } })), 9);
  assert.equal(flaggedFileId(flagged("Actor.B2", { sync: { characterFileId: null } })), null);
  assert.equal(flaggedFileId({ uuid: "Actor.B2" }), null);
});
