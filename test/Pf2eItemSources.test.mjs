import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildKeyOf, compendiumSource, customSource, loreSources, slottedFeat, withBuildFlag
} from "../scripts/service/Pf2eItemSources.mjs";
import { sluggify } from "./support/sluggify.mjs";

const MODULE = "organizr-foundry-connector";
const UUID = "Compendium.pf2e.feats-srd.Item.abcdefgh12345678";

function packFeat() {
  return {
    _id: "abcdefgh12345678",
    name: "Steady Footing",
    type: "feat",
    system: { level: { value: 2 }, rules: [{ key: "ChoiceSet", flag: "stance" }], runes: undefined },
    _stats: { coreVersion: "14", compendiumSource: null },
    flags: { pf2e: { note: "kept" } }
  };
}

test("a compendium source keeps its rules, drops its id and points back to its compendium entry", () => {
  const original = packFeat();
  const shaped = compendiumSource(original, UUID, "f:12");
  assert.equal(shaped._id, undefined);
  assert.deepEqual(shaped.system.rules, [{ key: "ChoiceSet", flag: "stance" }]);
  assert.equal(shaped._stats.compendiumSource, UUID);
  assert.equal(shaped._stats.coreVersion, "14");
  assert.deepEqual(shaped.flags[MODULE], { build: { key: "f:12" } });
  assert.deepEqual(shaped.flags.pf2e, { note: "kept" });
  assert.equal(original._id, "abcdefgh12345678");
  assert.equal(original.flags[MODULE], undefined);
});

test("recipe runes replace the compendium item's runes", () => {
  const blade = { _id: "x", name: "Longsword", type: "weapon", system: { runes: { potency: 0, striking: 0, property: ["old"] } } };
  const runes = { potency: 1, striking: 1, property: [] };
  const shaped = compendiumSource(blade, "Compendium.pf2e.equipment-srd.Item.x", "i:55", runes);
  assert.deepEqual(shaped.system.runes, runes);
  assert.notEqual(shaped.system.runes, runes);
  assert.deepEqual(compendiumSource(blade, "u", "i:56").system.runes, { potency: 0, striking: 0, property: ["old"] });
});

test("a custom source loses its id, sort and stats and gets its build key", () => {
  const document = { _id: "q", sort: 100, name: "Ember Knack", type: "feat", system: { level: { value: 1 } },
    _stats: { exportSource: { uuid: "Item.notAnIdAtAll00" } }, flags: { [MODULE]: { sheet: { fileId: 12 } } } };
  const shaped = customSource(document, "f:12");
  assert.equal(shaped._id, undefined);
  assert.equal(shaped.sort, undefined);
  assert.equal(shaped._stats, undefined);
  assert.deepEqual(shaped.flags[MODULE], { sheet: { fileId: 12 }, build: { key: "f:12" } });
  assert.equal(document.sort, 100);
});

test("a slotted feat takes the slot as location and the slot level as taken level", () => {
  const feat = compendiumSource(packFeat(), UUID, "f:12");
  const slotted = slottedFeat(feat, { group: "class", slotId: "class-4", level: 4 });
  assert.equal(slotted.system.location, "class-4");
  assert.deepEqual(slotted.system.level, { value: 2, taken: 4 });
  assert.equal(feat.system.location, undefined);
  const loose = slottedFeat(feat, null);
  assert.equal(loose.system.location, null);
  assert.deepEqual(loose.system.level, { value: 2 });
});

test("the build key is read back from an item source", () => {
  assert.equal(buildKeyOf(compendiumSource(packFeat(), UUID, "f:n:steady-footing")), "f:n:steady-footing");
  assert.equal(buildKeyOf(packFeat()), null);
  assert.equal(buildKeyOf(null), null);
  assert.deepEqual(withBuildFlag({ name: "Actor" }, { version: 1 }).flags[MODULE], { build: { version: 1 } });
});

test("lores are created when missing, raised when lower and kept when equal or higher", () => {
  const lores = [
    { key: "l:warfare-lore", name: "Warfare Lore", rank: 1 },
    { key: "l:library-lore", name: "Library", rank: 2 },
    { key: "l:harbor-lore", name: "Harbor Lore", rank: 1 },
    { key: "l:tide-lore", name: "Tide Lore", rank: 1 }
  ];
  const actorItems = [
    { id: "lib1", type: "lore", name: "Library Lore", system: { proficient: { value: 1 } } },
    { _id: "har1", type: "lore", name: "harbor lore", system: { proficient: { value: 2 } } },
    { id: "tide1", type: "lore", name: "Tide Lore", system: { proficient: { value: 1 } } },
    { id: "feat1", type: "feat", name: "Warfare Lore", system: {} }
  ];
  const { create, updates } = loreSources(lores, actorItems, sluggify);
  assert.deepEqual(create, [{ name: "Warfare Lore", type: "lore", system: { proficient: { value: 1 } },
    flags: { [MODULE]: { build: { key: "l:warfare-lore" } } } }]);
  assert.deepEqual(updates, [{ _id: "lib1", "system.proficient.value": 2 }]);
});

test("lores without a sluggify still match by a plain slug", () => {
  const { create, updates } = loreSources([{ key: "l:map-lore", name: "Map", rank: 3 }],
    [{ id: "m1", type: "lore", name: "Map Lore", system: { proficient: { value: 1 } } }]);
  assert.deepEqual(create, []);
  assert.deepEqual(updates, [{ _id: "m1", "system.proficient.value": 3 }]);
  assert.deepEqual(loreSources(null, null), { create: [], updates: [] });
});
