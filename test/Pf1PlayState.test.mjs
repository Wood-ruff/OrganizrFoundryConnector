import { test } from "node:test";
import assert from "node:assert/strict";
import { keepPf1BuffStates, keepPf1ItemUses, keepPf1SpellbookSlots } from "../scripts/service/Pf1PlayState.mjs";

function spell(id, name, preparation) {
  return { _id: id, name, type: "spell", system: { preparation } };
}

function buff(id, name, active) {
  return { _id: id, name, type: "buff", system: { active, level: 1 } };
}

function wand(id, name, uses) {
  return { _id: id, name, type: "consumable", system: { uses } };
}

test("conn-1 a removed spell does not hand its spent casts to the spell that takes over its id", () => {
  const current = [spell("organizrspl00000", "Magic Missile", { value: 0, max: 3 }), spell("organizrspl00001", "Shield", { value: 2, max: 2 })];
  const incoming = [spell("organizrspl00000", "Shield", { value: 2, max: 2 })];
  keepPf1ItemUses(incoming, current);
  assert.deepEqual(incoming[0].system.preparation, { value: 2, max: 2 });
});

test("sec-3 a removed wand does not hand its remaining charges to the wand that takes over its id", () => {
  const current = [
    wand("organizrinv00001", "Wand of Fireball", { per: "charges", value: 1, maxFormula: "10" }),
    wand("organizrinv00002", "Wand of Cure Light Wounds", { per: "charges", value: 50, maxFormula: "50" })
  ];
  const incoming = [wand("organizrinv00001", "Wand of Cure Light Wounds", { per: "charges", value: 50, maxFormula: "50" })];
  keepPf1ItemUses(incoming, current);
  assert.equal(incoming[0].system.uses.value, 50);
});

test("sec-3 an item of another type under the same id and name takes the incoming uses", () => {
  const current = [{ _id: "organizrinv00001", name: "Ember Rod", type: "equipment", system: { uses: { value: 1 } } }];
  const incoming = [wand("organizrinv00001", "Ember Rod", { value: 5, maxFormula: "5" })];
  keepPf1ItemUses(incoming, current);
  assert.equal(incoming[0].system.uses.value, 5);
});

test("an item with the same id, type and name keeps its remaining uses and prepared casts", () => {
  const current = [
    wand("organizrinv00001", "Wand of Glow", { value: 3, maxFormula: "10" }),
    spell("organizrspl00000", "Mist Veil", { value: 1, max: 3 })
  ];
  const incoming = [
    wand("organizrinv00001", "Wand of Glow", { value: 10, maxFormula: "10" }),
    spell("organizrspl00000", "Mist Veil", { value: 3, max: 3 })
  ];
  keepPf1ItemUses(incoming, current);
  assert.equal(incoming[0].system.uses.value, 3);
  assert.deepEqual(incoming[1].system.preparation, { value: 1, max: 3 });
});

test("conn-2 a lowered uses per day caps the kept value at the incoming count", () => {
  const current = [{ _id: "organizrent00000", name: "Rage", type: "feat", system: { uses: { per: "day", value: 7, maxFormula: "7" } } }];
  const incoming = [{ _id: "organizrent00000", name: "Rage", type: "feat", system: { uses: { per: "day", value: 4, maxFormula: "4" } } }];
  keepPf1ItemUses(incoming, current);
  assert.deepEqual(incoming[0].system.uses, { per: "day", value: 4, maxFormula: "4" });
});

test("conn-2 a kept value stays when the incoming uses carry no count", () => {
  const current = [{ _id: "organizrent00000", name: "Rage", type: "feat", system: { uses: { per: "day", value: 2 } } }];
  const incoming = [{ _id: "organizrent00000", name: "Rage", type: "feat", system: { uses: { per: "day", maxFormula: "4" } } }];
  keepPf1ItemUses(incoming, current);
  assert.equal(incoming[0].system.uses.value, 2);
});

test("sec-3 a spellbook whose id now names another book takes the incoming slots", () => {
  const current = { system: { attributes: { spells: { spellbooks: {
    primary: { name: "Wizard Spells", spells: { spell1: { base: 0, value: 0 } } },
    secondary: { name: "Sorcerer Spells", spells: { spell1: { base: 4, value: 3 } } }
  } } } } };
  const result = { system: { attributes: { spells: { spellbooks: {
    primary: { name: "Sorcerer Spells", spells: { spell1: { base: 4 } } }
  } } } } };
  keepPf1SpellbookSlots(result, current);
  assert.deepEqual(result.system.attributes.spells.spellbooks.primary.spells.spell1, { base: 4 });
});

test("a spellbook with the same id and name keeps its remaining casts", () => {
  const current = { system: { attributes: { spells: { spellbooks: {
    primary: { name: "Sorcerer Spells", spells: { spell1: { base: 4, value: 1 } } }
  } } } } };
  const result = { system: { attributes: { spells: { spellbooks: {
    primary: { name: "Sorcerer Spells", spells: { spell1: { base: 4 } } }
  } } } } };
  keepPf1SpellbookSlots(result, current);
  assert.deepEqual(result.system.attributes.spells.spellbooks.primary.spells.spell1, { base: 4, value: 1 });
});

test("s1 an exported buff switched on in Foundry stays on when the export brings it back", () => {
  const current = [buff("organizrbuf00001", "Test Blessing", true)];
  const incoming = [buff("organizrbuf00001", "Test Blessing", false)];
  incoming[0].system.level = 3;
  keepPf1BuffStates(incoming, current);
  assert.deepEqual(incoming[0].system, { active: true, level: 3 });
});

test("s1 a buff switched off in Foundry stays off", () => {
  const current = [buff("organizrbuf00001", "Test Blessing", false)];
  const incoming = [buff("organizrbuf00001", "Test Blessing", true)];
  keepPf1BuffStates(incoming, current);
  assert.equal(incoming[0].system.active, false);
});

test("s1 a Foundry buff the export brings back under Organizr's id hands over its state by name", () => {
  const current = [buff("foundryHaste0001", "Quickened Test", true)];
  const incoming = [buff("organizrbuf00002", "Quickened Test", false)];
  keepPf1BuffStates(incoming, current);
  assert.equal(incoming[0].system.active, true);
});

test("s1 a removed buff does not hand its state to the buff that takes over its id", () => {
  const current = [buff("organizrbuf00001", "Test Blessing", true), buff("organizrbuf00002", "Test Ward", false)];
  const incoming = [buff("organizrbuf00001", "Test Ward", true), buff("organizrbuf00002", "Fresh Test", true)];
  keepPf1BuffStates(incoming, current);
  assert.deepEqual(incoming.map((item) => item.system.active), [false, true]);
});

test("s1 only buffs carry their state, and a current buff without a state leaves the incoming one", () => {
  const current = [
    { _id: "organizrfea00001", name: "Test Rage", type: "feat", system: { active: true } },
    { _id: "organizrbuf00001", name: "Test Blessing", type: "buff", system: {} }
  ];
  const incoming = [
    { _id: "organizrfea00001", name: "Test Rage", type: "feat", system: { active: false } },
    buff("organizrbuf00001", "Test Blessing", false)
  ];
  keepPf1BuffStates(incoming, current);
  assert.deepEqual(incoming.map((item) => item.system.active), [false, false]);
});
