import { test } from "node:test";
import assert from "node:assert/strict";
import { adoptableItems, adoptionUpdates } from "../scripts/service/AdoptedItems.mjs";

const MODULE = "organizr-foundry-connector";
const OWN = "ownbuild00000001";
const OTHER = "otherbuild000001";

function actorItem(id, name, build = null) {
  const flags = build ? { [MODULE]: { build } } : {};
  return { id, _id: id, name, type: "equipment", flags };
}

function planOf(keys, extra = {}) {
  return { buildId: OWN, sources: new Map(keys.map((key) => [key, { name: key }])), ...extra };
}

test("entries whose linked sheet was pushed from an item the actor holds take that item over, in recipe order", () => {
  const recipe = {
    features: [{ key: "f:21", name: "Marsh Stride", foundryItemId: "handstride000001" }],
    actions: [{ key: "a:22", name: "Reed Call", foundryItemId: "handcall00000001" }],
    spellcasting: [{ key: "e:gifts", spells: [{ key: "e:gifts/s:23", name: "Glow Mote", foundryItemId: "handmote00000001" }] }],
    inventory: [
      { key: "i:24", name: "Field Rations", foundryItemId: "handrations00001" },
      { key: "i:25", name: "Reed Pack", foundryItemId: "handpack00000001" }
    ]
  };
  const items = [
    actorItem("handpack00000001", "Reed Pack"), actorItem("handrations00001", "Field Rations"),
    actorItem("handmote00000001", "Glow Mote"), actorItem("handcall00000001", "Reed Call"),
    actorItem("handstride000001", "Marsh Stride")
  ];
  const plan = planOf(["f:21", "a:22", "e:gifts/s:23", "i:24", "i:25"]);

  assert.deepEqual(adoptableItems(recipe, plan, items), [
    { key: "f:21", id: "handstride000001" }, { key: "a:22", id: "handcall00000001" },
    { key: "e:gifts/s:23", id: "handmote00000001" }, { key: "i:24", id: "handrations00001" },
    { key: "i:25", id: "handpack00000001" }
  ]);
});

test("an item of this build is never taken over; one another build made or one without an owner is", () => {
  const recipe = {
    inventory: [
      { key: "i:31", name: "Silk Rope", foundryItemId: "ownrope000000001" },
      { key: "i:32", name: "Mint Tonic", foundryItemId: "tradedtonic00001" }
    ]
  };
  const items = [
    actorItem("ownrope000000001", "Silk Rope", { key: "i:40", owner: OWN }),
    actorItem("tradedtonic00001", "Mint Tonic", { key: "i:9", owner: OTHER })
  ];

  assert.deepEqual(adoptableItems(recipe, planOf(["i:31", "i:32"]), items), [{ key: "i:32", id: "tradedtonic00001" }]);
});

test("nothing is taken over without an item id, a held item, a planned source or for gear left out", () => {
  const recipe = {
    features: [{ key: "f:41", name: "Old Oath", foundryItemId: null }],
    actions: [{ key: "a:42", name: "Lost Call", foundryItemId: "gonecall00000001" }],
    inventory: [
      { key: "i:43", name: "Odd Charm", foundryItemId: "oddcharm00000001" },
      { key: "i:44", name: "Used Tonic", foundryItemId: "usedtonic0000001" }
    ]
  };
  const items = [actorItem("oddcharm00000001", "Odd Charm"), actorItem("usedtonic0000001", "Used Tonic")];
  const plan = planOf(["f:41", "a:42", "i:44"], { skipsGear: (key) => key === "i:44" });

  assert.deepEqual(adoptableItems(recipe, plan, items), []);
  assert.deepEqual(adoptableItems({}, plan, items), []);
});

test("an item two entries name is taken over by the first one only", () => {
  const recipe = {
    inventory: [
      { key: "i:51", name: "Field Rations", foundryItemId: "handrations00001" },
      { key: "i:51#2", name: "Field Rations", foundryItemId: "handrations00001" }
    ]
  };
  const items = [actorItem("handrations00001", "Field Rations")];

  assert.deepEqual(adoptableItems(recipe, planOf(["i:51", "i:51#2"]), items), [{ key: "i:51", id: "handrations00001" }]);
});

test("a taken-over item gets its entry's key and the build as owner", () => {
  assert.deepEqual(adoptionUpdates([{ key: "i:24", id: "handrations00001" }], OWN), [
    { _id: "handrations00001", [`flags.${MODULE}.build`]: { key: "i:24", owner: OWN } }
  ]);
  assert.deepEqual(adoptionUpdates([], OWN), []);
});
