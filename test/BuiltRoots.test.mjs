import { test } from "node:test";
import assert from "node:assert/strict";
import { actorBuildId, isBuiltActor, ownRoots, rootIdsToDelete, strayKeyUpdates } from "../scripts/service/BuiltRoots.mjs";

const MODULE = "organizr-foundry-connector";

function rooted(_id, type, name, build, system = {}) {
  return { _id, type, name, system, flags: { [MODULE]: { build } } };
}

function plain(_id, type, name, system = {}) {
  return { _id, type, name, system, flags: {} };
}

function actorWith(build, items) {
  return { flags: { [MODULE]: { build, sheet: { fileId: 52 } } }, items };
}

const OWN = "ownbuild00000001";
const OTHER = "otherbuild000001";

test("the build id is read from the actor's build flag; a build without one, or no build, has none", () => {
  assert.equal(actorBuildId(actorWith({ version: 1, id: OWN }, [])), OWN);
  assert.equal(actorBuildId(actorWith({ version: 1 }, [])), null);
  assert.equal(actorBuildId(actorWith({ version: 1, id: "" }, [])), null);
  assert.equal(actorBuildId({ flags: {} }), null);
  assert.equal(isBuiltActor(actorWith({ version: 1 }, [])), true);
  assert.equal(isBuiltActor({ flags: { [MODULE]: { build: null } } }), false);
});

test("an item another build made, traded in from another actor, is kept and is no root", () => {
  const actor = actorWith({ version: 1, id: OWN }, [
    rooted("ownrope000000001", "equipment", "Silk Rope", { key: "i:5", owner: OWN }),
    rooted("tradedtonic00001", "consumable", "Mint Tonic", { key: "i:9", owner: OTHER })
  ]);
  assert.deepEqual([...ownRoots(actor).keys()], ["i:5"]);
  assert.deepEqual(rootIdsToDelete(actor), ["ownrope000000001"]);
});

test("a second item with the same key, a split stack or a duplicate, is kept; only the first one is the root", () => {
  const actor = actorWith({ version: 1, id: OWN }, [
    rooted("arrows0000000001", "ammo", "Reed Arrows", { key: "i:7", owner: OWN }, { quantity: 12 }),
    rooted("arrows0000000002", "ammo", "Reed Arrows", { key: "i:7", owner: OWN }, { quantity: 8 })
  ]);
  assert.equal(ownRoots(actor).get("i:7")._id, "arrows0000000001");
  assert.deepEqual(rootIdsToDelete(actor), ["arrows0000000001"]);
});

test("an actor built before builds had an id owns the items without an owner, not those another build made", () => {
  const actor = actorWith({ version: 1 }, [
    rooted("oldrope000000001", "equipment", "Silk Rope", { key: "i:5" }),
    rooted("tradedtonic00001", "consumable", "Mint Tonic", { key: "i:9", owner: OTHER })
  ]);
  assert.deepEqual(rootIdsToDelete(actor), ["oldrope000000001"]);
});

test("an item without an owner on an actor whose build has an id came from an older build elsewhere and is kept", () => {
  const actor = actorWith({ version: 1, id: OWN }, [rooted("oldtonic00000001", "consumable", "Mint Tonic", { key: "i:9" })]);
  assert.deepEqual(rootIdsToDelete(actor), []);
});

test("coins are kept as one block or all replaced, whether the build made them or pf2e made change", () => {
  const actor = actorWith({ version: 1, id: OWN }, [
    rooted("goldcoins0000001", "treasure", "Gold Pieces", { key: "c:gp", owner: OWN }, { category: "coin", quantity: 2 }),
    plain("changesilver0001", "treasure", "Silver Pieces", { category: "coin", quantity: 7 }),
    plain("rubygem000000001", "treasure", "Cut Ruby", { category: "gem", quantity: 1 })
  ]);
  assert.deepEqual(rootIdsToDelete(actor, { keepCoins: true }), []);
  assert.deepEqual(rootIdsToDelete(actor, { keepCoins: false }), ["goldcoins0000001", "changesilver0001"]);
  assert.deepEqual(rootIdsToDelete(actor), ["goldcoins0000001", "changesilver0001"]);
});

test("an actor the connector did not build keeps its conditions, effects, afflictions and, when asked, its coins", () => {
  const actor = {
    flags: { [MODULE]: { sheet: { fileId: 52 } } },
    items: [
      plain("oldclass00000001", "class", "Spellwright"),
      plain("frightened000001", "condition", "Frightened"),
      plain("effect0000000001", "effect", "Blessed Ward"),
      plain("affliction000001", "affliction", "Marsh Venom"),
      plain("oldgold000000001", "treasure", "Gold Pieces", { category: "coin", quantity: 4 })
    ]
  };
  assert.deepEqual(rootIdsToDelete(actor, { keepCoins: true }), ["oldclass00000001"]);
  assert.deepEqual(rootIdsToDelete(actor, { keepCoins: false }), ["oldclass00000001", "oldgold000000001"]);
  assert.equal(ownRoots(actor).size, 0);
});

test("kept items with a key that is not their own root lose the build flag; roots, deleted items and plain items do not", () => {
  const actor = actorWith({ version: 1, id: OWN }, [
    rooted("arrows0000000001", "ammo", "Reed Arrows", { key: "i:7", owner: OWN }, { quantity: 12 }),
    rooted("arrows0000000002", "ammo", "Reed Arrows", { key: "i:7", owner: OWN }, { quantity: 8 }),
    rooted("tradedtonic00001", "consumable", "Mint Tonic", { key: "i:9", owner: OTHER }),
    rooted("goldcoins0000001", "treasure", "Gold Pieces", { key: "c:gp", owner: OWN }, { category: "coin", quantity: 2 }),
    plain("lantern000000001", "equipment", "Hand Lantern")
  ]);
  const flag = `flags.${MODULE}.build`;
  assert.deepEqual(strayKeyUpdates(actor, { keepCoins: true }), [
    { _id: "arrows0000000002", [flag]: null }, { _id: "tradedtonic00001", [flag]: null }
  ]);
  assert.deepEqual(strayKeyUpdates(actorWith({ version: 1, id: OWN }, [])), []);
});

test("an item marked as covering an entry is no root: kept unless its granter goes, and never cleared as a stray", () => {
  const actor = actorWith({ version: 1, id: OWN }, [
    rooted("classfighter0001", "class", "Fighter", { key: "id:class", owner: OWN }),
    rooted("grantedstep00001", "action", "Reed Step", { covers: "a:14" }, {}),
    rooted("handstep00000001", "feat", "Marsh Stride", { covers: "f:15" }, {})
  ]);
  actor.items[1].flags.pf2e = { grantedBy: { id: "classfighter0001" } };
  assert.deepEqual([...ownRoots(actor).keys()], ["id:class"]);
  assert.deepEqual(rootIdsToDelete(actor), ["classfighter0001", "grantedstep00001"]);
  assert.deepEqual(strayKeyUpdates(actor), []);
});
