import { test } from "node:test";
import assert from "node:assert/strict";
import { characterRows } from "../scripts/service/CharacterList.mjs";

const users = [
  { id: "gm", name: "Game Master", isGM: true },
  { id: "p1", name: "Alice", isGM: false },
  { id: "p2", name: "Bob", isGM: false }
];

function actor(overrides) {
  return { id: "a", name: "Hero", img: "icons/hero.webp", type: "character", ownership: { default: 0 }, ...overrides };
}

test("only character-type actors are listed, sorted by name", () => {
  const rows = characterRows([
    actor({ id: "z", name: "Zed" }),
    actor({ id: "n", name: "Nope", type: "npc" }),
    actor({ id: "a", name: "Anna" })
  ], users);
  assert.deepEqual(rows.map((r) => r.id), ["a", "z"]);
});

test("owners are the non-GM users with owner level, by explicit entry or default", () => {
  const explicit = characterRows([actor({ ownership: { default: 0, p1: 3, gm: 3 } })], users)[0];
  assert.deepEqual(explicit.owners, ["Alice"]);
  assert.equal(explicit.ownersLabel, "Alice");
  assert.equal(explicit.hasPlayerOwner, true);

  const byDefault = characterRows([actor({ ownership: { default: 3 } })], users)[0];
  assert.deepEqual(byDefault.owners, ["Alice", "Bob"]);

  const observerOnly = characterRows([actor({ ownership: { default: 0, p1: 2 } })], users)[0];
  assert.deepEqual(observerOnly.owners, []);
  assert.equal(observerOnly.hasPlayerOwner, false);
});

test("missing ownership or users do not break the rows", () => {
  const rows = characterRows([actor({ ownership: undefined })], undefined);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].owners, []);
});

test("sync state comes from the module flag on the actor", () => {
  const flagged = actor({ flags: { "organizr-foundry-connector": { sync: { characterFileId: 7, syncedAt: "2026-10-16T12:00:00Z" } } } });
  const rows = characterRows([flagged, actor({ id: "b", name: "Plain" })], users);
  assert.equal(rows[0].synced, true);
  assert.equal(rows[0].syncedAt, "2026-10-16T12:00:00Z");
  assert.equal(rows[1].synced, false);
  assert.equal(rows[1].syncedAt, null);
});

test("a sync flag a Duplicate copied from another actor shows the copy as not synced", () => {
  const sync = { characterFileId: 7, syncedAt: "2026-10-16T12:00:00Z", documentUuid: "Actor.a" };
  const original = actor({ uuid: "Actor.a", flags: { "organizr-foundry-connector": { sync } } });
  const copy = actor({ id: "b", uuid: "Actor.b", name: "Hero (Copy)", flags: { "organizr-foundry-connector": { sync } } });
  const rows = characterRows([original, copy], users);
  assert.equal(rows[0].synced, true);
  assert.equal(rows[0].syncedAt, "2026-10-16T12:00:00Z");
  assert.equal(rows[1].synced, false);
  assert.equal(rows[1].syncedAt, null);
});
