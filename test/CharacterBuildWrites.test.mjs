import { test } from "node:test";
import assert from "node:assert/strict";
import { writeBuildItems } from "../scripts/entry/CharacterBuildWrites.mjs";
import { recipeEvidence } from "../scripts/service/Pf2eRecipe.mjs";
import { sluggify } from "./support/sluggify.mjs";

const MODULE = "organizr-foundry-connector";

globalThis.game = { pf2e: { system: { sluggify } } };

function fakeActor(onCreate = () => {}, held = []) {
  const items = new Map(held.map((item) => [item.id, item]));
  const itemUpdates = [];
  let next = 1;
  const created = (source) => {
    const id = `item${String(next++).padStart(12, "0")}`;
    const item = { ...structuredClone(source), id, _id: id, updates: [] };
    item.update = async (update) => item.updates.push(update);
    items.set(id, item);
    return item;
  };
  return {
    level: 1,
    feats: [],
    items: { get: (id) => items.get(id), [Symbol.iterator]: () => items.values() },
    itemUpdates,
    async createEmbeddedDocuments(type, sources) {
      onCreate(sources);
      return sources.map(created);
    },
    async updateEmbeddedDocuments(type, updates) {
      itemUpdates.push(...updates);
    }
  };
}

function flagged(source, key) {
  return { ...source, flags: { [MODULE]: { build: { key } } } };
}

function featSource(name, category, key) {
  return flagged({ name, type: "feat", system: { slug: sluggify(name), category } }, key);
}

function spellSource(name, key) {
  return flagged({ name, type: "spell", system: { slug: sluggify(name), level: { value: 1 } } }, key);
}

function castingOf(key, type, spells) {
  return { key, name: key, tradition: "arcane", type, flexible: false, attribute: "int", proficiency: "spellcasting",
    rank: 1, slots: type === "prepared" ? { "0": 2 } : {}, slotsUsed: {}, spells };
}

function cantrip(key, name) {
  return { key, name, rank: 0, cantrip: true, focus: false, signature: false, prepared: 1, usesPerDay: null };
}

function planOf(sources) {
  return { identity: {}, boosts: null, sources: new Map(sources), matches: { entries: [] } };
}

test("a feature pf2e never slots is not reported as placed outside a feat slot; a slotted kind without room is", async () => {
  const recipe = {
    features: [
      { key: "f:own-trick", name: "Own Trick", category: "classfeature", level: 1 },
      { key: "f:gift", name: "Patron Gift", category: "bonus", level: 1 },
      { key: "f:hardy", name: "Hardy Stride", category: "general", level: 1 }
    ]
  };
  const plan = planOf([
    ["f:own-trick", featSource("Own Trick", "classfeature", "f:own-trick")],
    ["f:gift", featSource("Patron Gift", "bonus", "f:gift")],
    ["f:hardy", featSource("Hardy Stride", "general", "f:hardy")]
  ]);
  const actor = fakeActor();

  const written = await writeBuildItems(actor, recipe, plan, recipeEvidence(recipe, sluggify));

  assert.deepEqual(written.unslotted, ["Hardy Stride"]);
  assert.deepEqual([...actor.items].map((item) => item.name).sort(), ["Hardy Stride", "Own Trick", "Patron Gift"]);
});

test("a cantrip listed in an innate and a prepared entry is created in both and fills the prepared slot", async () => {
  const recipe = {
    spellcasting: [
      castingOf("e:gift", "innate", [cantrip("e:gift/s:glint", "Glint Sense")]),
      castingOf("e:book", "prepared", [cantrip("e:book/s:glint", "Glint Sense")])
    ]
  };
  const plan = planOf([
    ["e:gift/s:glint", spellSource("Glint Sense", "e:gift/s:glint")],
    ["e:book/s:glint", spellSource("Glint Sense", "e:book/s:glint")]
  ]);
  const actor = fakeActor();

  const written = await writeBuildItems(actor, recipe, plan, recipeEvidence(recipe, sluggify));

  const items = [...actor.items];
  const entries = items.filter((item) => item.type === "spellcastingEntry");
  const spells = items.filter((item) => item.type === "spell");
  assert.deepEqual(spells.map((spell) => spell.system.location.value), entries.map((entry) => entry.id));
  const book = entries.find((entry) => entry.name === "e:book");
  const bookSpell = spells.find((spell) => spell.system.location.value === book.id);
  assert.deepEqual(book.updates, [{ "system.slots.slot0.prepared": [{ id: bookSpell.id, expended: false }] }]);
  assert.deepEqual(written.unplaced, []);
});

test("each feature is created while the evidence names it as the entry being written", async () => {
  const recipe = {
    features: [
      { key: "f:craft-medicine", name: "Steady Craft (Medicine)", category: "general", level: 1 },
      { key: "f:craft-athletics", name: "Steady Craft (Athletics)", category: "skill", level: 2 }
    ]
  };
  const plan = planOf([
    ["f:craft-medicine", featSource("Steady Craft", "general", "f:craft-medicine")],
    ["f:craft-athletics", featSource("Steady Craft", "skill", "f:craft-athletics")]
  ]);
  const evidence = recipeEvidence(recipe, sluggify);
  const writing = [];
  const actor = fakeActor(() => writing.push(evidence.writing));

  await writeBuildItems(actor, recipe, plan, evidence);

  assert.deepEqual(writing, ["Steady Craft (Medicine)", "Steady Craft (Athletics)"]);
  assert.equal(evidence.writing, null);
});

function gearOf(name, type, key) {
  return flagged({ name, type, system: { quantity: 1, equipped: { carryType: "worn" } } }, key);
}

function gearPlanOf() {
  const plan = planOf([
    ["i:1", gearOf("Silk Rope", "equipment", "i:1")],
    ["i:2", gearOf("Mint Tonic", "consumable", "i:2")],
    ["c:gp", gearOf("Gold Pieces", "treasure", "c:gp")]
  ]);
  plan.matches.entries = [{ key: "c:gp", list: "coins" }];
  return plan;
}

const GEAR_RECIPE = {
  inventory: [
    { key: "i:1", name: "Silk Rope", quantity: 1, equipped: false, container: null },
    { key: "i:2", name: "Mint Tonic", quantity: 2, equipped: false, container: null }
  ]
};

test("every item a build creates names the build as its owner", async () => {
  const plan = { ...gearPlanOf(), buildId: "ownbuild00000001" };
  const actor = fakeActor();

  await writeBuildItems(actor, GEAR_RECIPE, plan, recipeEvidence(GEAR_RECIPE, sluggify));

  const owners = [...actor.items].map((item) => [item.name, item.flags[MODULE].build.owner]);
  assert.deepEqual(owners, [["Silk Rope", "ownbuild00000001"], ["Mint Tonic", "ownbuild00000001"], ["Gold Pieces", "ownbuild00000001"]]);
});

test("a refresh that keeps the inventory leaves out used-up gear and the coins", async () => {
  const plan = { ...gearPlanOf(), skipsGear: (key) => key === "i:2", keepsCoins: true };
  const actor = fakeActor();

  await writeBuildItems(actor, GEAR_RECIPE, plan, recipeEvidence(GEAR_RECIPE, sluggify));

  assert.deepEqual([...actor.items].map((item) => item.name), ["Silk Rope"]);
});

test("without those choices every gear entry and the coins are created", async () => {
  const actor = fakeActor();

  await writeBuildItems(actor, GEAR_RECIPE, gearPlanOf(), recipeEvidence(GEAR_RECIPE, sluggify));

  assert.deepEqual([...actor.items].map((item) => item.name), ["Silk Rope", "Mint Tonic", "Gold Pieces"]);
});

function heldItem(id, name, type, system = {}) {
  return { id, _id: id, name, type, system: { slug: sluggify(name), ...system }, flags: {} };
}

test("items the linked sheets were pushed from become roots instead of copies and a taken-over pack still holds gear", async () => {
  const recipe = {
    inventory: [
      { key: "i:25", name: "Reed Pack", quantity: 1, equipped: false, container: null, foundryItemId: "handpack00000001" },
      { key: "i:24", name: "Field Rations", quantity: 3, equipped: false, container: "i:25", foundryItemId: "handrations00001" },
      { key: "i:26", name: "Silk Rope", quantity: 1, equipped: false, container: "i:25", foundryItemId: null }
    ]
  };
  const plan = planOf([
    ["i:25", gearOf("Reed Pack", "backpack", "i:25")],
    ["i:24", gearOf("Field Rations", "consumable", "i:24")],
    ["i:26", gearOf("Silk Rope", "equipment", "i:26")]
  ]);
  plan.buildId = "ownbuild00000001";
  const actor = fakeActor(() => {}, [
    heldItem("handpack00000001", "Reed Pack", "backpack"),
    heldItem("handrations00001", "Field Rations", "consumable", { quantity: 2, containerId: "handpack00000001" })
  ]);

  await writeBuildItems(actor, recipe, plan, recipeEvidence(recipe, sluggify));

  const items = [...actor.items];
  assert.deepEqual(items.map((item) => item.name), ["Reed Pack", "Field Rations", "Silk Rope"]);
  assert.equal(items[2].system.containerId, "handpack00000001");
  assert.equal(items[1].system.quantity, 2);
  const flag = `flags.${MODULE}.build`;
  assert.deepEqual(actor.itemUpdates, [
    { _id: "handpack00000001", [flag]: { key: "i:25", owner: "ownbuild00000001" } },
    { _id: "handrations00001", [flag]: { key: "i:24", owner: "ownbuild00000001" } }
  ]);
});

test("a feature or action an item pf2e granted already holds is not created and that item gets the entry's cover mark", async () => {
  const recipe = {
    features: [{ key: "f:61", name: "Steady Guard", category: "classfeature", level: 1 }],
    actions: [{ key: "a:62", name: "Reed Step" }]
  };
  const plan = planOf([
    ["f:61", featSource("Steady Guard", "classfeature", "f:61")],
    ["a:62", flagged({ name: "Reed Step", type: "action", system: { slug: "reed-step" } }, "a:62")]
  ]);
  const actor = fakeActor(() => {}, [
    heldItem("grantedguard0001", "Steady Guard", "feat"), heldItem("grantedstep00001", "Reed Step", "action")
  ]);

  await writeBuildItems(actor, recipe, plan, recipeEvidence(recipe, sluggify));

  assert.equal([...actor.items].length, 2);
  const covers = `flags.${MODULE}.build.covers`;
  assert.deepEqual(actor.itemUpdates, [
    { _id: "grantedguard0001", [covers]: "f:61" }, { _id: "grantedstep00001", [covers]: "a:62" }
  ]);
});
