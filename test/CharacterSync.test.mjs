import { test } from "node:test";
import assert from "node:assert/strict";
import { syncBody, syncErrorKey, syncFlag, syncOutcome } from "../scripts/service/CharacterSync.mjs";

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

test("sync flag remembers the Organizr file and where it was pushed", () => {
  const flag = syncFlag({ characterFileId: 7, folderId: 3 }, { serverUrl: "https://o", projectId: "12", apiToken: "org_x" }, "2026-10-16T12:00:00Z");
  assert.deepEqual(flag, { characterFileId: 7, folderId: 3, serverUrl: "https://o", projectId: "12", syncedAt: "2026-10-16T12:00:00Z" });
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
