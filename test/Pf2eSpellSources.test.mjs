import { test } from "node:test";
import assert from "node:assert/strict";
import { entrySource, preparedSlots, spellLocation } from "../scripts/service/Pf2eSpellSources.mjs";

const MODULE = "organizr-foundry-connector";

function recipeEntry(values) {
  return { key: "e:test-spells", name: "Test Spells", tradition: "arcane", type: "prepared", flexible: false,
    attribute: "int", proficiency: "spellcasting", rank: 1, slots: {}, slotsUsed: {}, spells: [], ...values };
}

function spell(key, values) {
  return { key, name: key, rank: 1, cantrip: false, focus: false, signature: false, prepared: 0, usesPerDay: null,
    ...values };
}

test("a prepared entry source has full slots, its statistic and its build key", () => {
  const source = entrySource(recipeEntry({ slots: { "0": 5, "1": 3 }, slotsUsed: { "1": 1 } }), "wizard", "e:test-spells");
  assert.deepEqual(source, {
    name: "Test Spells",
    type: "spellcastingEntry",
    system: {
      ability: { value: "int" },
      tradition: { value: "arcane" },
      prepared: { value: "prepared", flexible: false },
      proficiency: { value: 1, slug: "" },
      slots: { slot0: { max: 5, value: 5, prepared: [] }, slot1: { max: 3, value: 3, prepared: [] } }
    },
    flags: { [MODULE]: { build: { key: "e:test-spells" } } }
  });
});

test("a spontaneous entry counts its used slots and a class DC entry names the class", () => {
  const entry = recipeEntry({ type: "spontaneous", flexible: true, proficiency: "classDc", rank: 2,
    slots: { "1": 4, "2": 2 }, slotsUsed: { "1": 3, "2": 5 } });
  const source = entrySource(entry, "oracle", "e:x");
  assert.deepEqual(source.system.slots, { slot1: { max: 4, value: 1, prepared: [] }, slot2: { max: 2, value: 0, prepared: [] } });
  assert.deepEqual(source.system.prepared, { value: "spontaneous", flexible: true });
  assert.deepEqual(source.system.proficiency, { value: 2, slug: "oracle" });
  assert.equal(entrySource(recipeEntry({ type: "innate" }), null, "e:y").system.prepared.value, "innate");
  assert.equal(entrySource(recipeEntry({ type: "focus" }), "wizard", "e:z").system.prepared.value, "focus");
});

test("ritual and other entries create no entry and their spells stay outside one", () => {
  assert.equal(entrySource(recipeEntry({ type: "ritual" }), "wizard", "e:r"), null);
  assert.equal(entrySource(recipeEntry({ type: "other" }), "wizard", "e:o"), null);
  assert.deepEqual(spellLocation(spell("s:1", {}), recipeEntry({ type: "ritual" }), "ignored"), { value: null });
  assert.deepEqual(spellLocation(spell("s:1", {}), recipeEntry({ type: "other" }), null), { value: null });
});

test("innate spells carry their uses per day", () => {
  const innate = recipeEntry({ type: "innate" });
  assert.deepEqual(spellLocation(spell("s:1", { usesPerDay: 2 }), innate, "ent1"), { value: "ent1", uses: { value: 2, max: 2 } });
  assert.deepEqual(spellLocation(spell("s:2", { usesPerDay: null }), innate, "ent1"), { value: "ent1" });
});

test("only spontaneous spells are signature spells", () => {
  const signature = spell("s:1", { signature: true });
  assert.deepEqual(spellLocation(signature, recipeEntry({ type: "spontaneous" }), "ent1"), { value: "ent1", signature: true });
  assert.deepEqual(spellLocation(signature, recipeEntry({ type: "prepared" }), "ent1"), { value: "ent1" });
  assert.deepEqual(spellLocation(spell("s:2", {}), recipeEntry({ type: "spontaneous" }), "ent1"), { value: "ent1" });
});

test("preparations beyond a slot's maximum move to the lowest higher rank with room", () => {
  const entry = recipeEntry({ slots: { "1": 3, "2": 2 }, spells: [spell("e/s:1", { prepared: 4 })] });
  assert.deepEqual(preparedSlots(entry, new Map([["e/s:1", "sp1"]])), {
    "system.slots.slot1.prepared": [
      { id: "sp1", expended: false }, { id: "sp1", expended: false }, { id: "sp1", expended: false }
    ],
    "system.slots.slot2.prepared": [{ id: "sp1", expended: false }]
  });
});

test("used slots expend the first preparations of their rank", () => {
  const entry = recipeEntry({
    slots: { "1": 2, "2": 2 },
    slotsUsed: { "1": 1, "2": 5 },
    spells: [spell("e/s:a", { prepared: 1 }), spell("e/s:b", { prepared: 1 }), spell("e/s:c", { rank: 2, prepared: 1 })]
  });
  assert.deepEqual(preparedSlots(entry, { "e/s:a": "a1", "e/s:b": "b1", "e/s:c": "c1" }), {
    "system.slots.slot1.prepared": [{ id: "a1", expended: true }, { id: "b1", expended: false }],
    "system.slots.slot2.prepared": [{ id: "c1", expended: true }]
  });
});

test("cantrips stay in slot0 even when it is full", () => {
  const entry = recipeEntry({
    slots: { "0": 2, "1": 3 },
    spells: [spell("e/s:c1", { cantrip: true, prepared: 1 }), spell("e/s:c2", { cantrip: true, prepared: 2 })]
  });
  assert.deepEqual(preparedSlots(entry, { "e/s:c1": "c1", "e/s:c2": "c2" }), {
    "system.slots.slot0.prepared": [{ id: "c1", expended: false }, { id: "c2", expended: false }]
  });
});

test("spells without a created id and entries that are not prepared give no preparations", () => {
  const entry = recipeEntry({ slots: { "1": 3 }, spells: [spell("e/s:1", { prepared: 2 })] });
  assert.deepEqual(preparedSlots(entry, {}), {});
  assert.deepEqual(preparedSlots({ ...entry, type: "spontaneous" }, { "e/s:1": "x" }), {});
  assert.deepEqual(preparedSlots(null, null), {});
});
