import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ATTRIBUTES, boostInput, boostPlan, laterBoostCounts, manualAbilities, manualReason
} from "../scripts/service/Pf2eBoosts.mjs";

const FREE = ["str", "dex", "con", "int", "wis", "cha"];

/** Applies a plan the way pf2e prepares a character's attributes, for checking plans against their targets. */
function derive(input, plan) {
  const values = Object.fromEntries(ATTRIBUTES.map((attribute) => [attribute, 0]));
  const boost = (attribute) => { values[attribute] += values[attribute] >= 4 ? 0.5 : 1; };
  for (const attribute of ancestryBoostsOf(input, plan)) boost(attribute);
  if (!plan.ancestry.alternate) for (const flaw of input.ancestry?.flaws ?? []) values[flaw] -= 1;
  for (const attribute of Object.values(plan.background.selected)) boost(attribute);
  if (plan.keyAttribute) boost(plan.keyAttribute);
  for (const level of ["1", "5", "10", "15", "20"]) for (const attribute of plan.boosts[level] ?? []) boost(attribute);
  return Object.fromEntries(ATTRIBUTES.map((attribute) => [attribute, Math.trunc(values[attribute])]));
}

function ancestryBoostsOf(input, plan) {
  if (plan.ancestry.alternate) return plan.ancestry.alternate;
  return Object.values(plan.ancestry.selected);
}

function targets(values) {
  return { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0, ...values };
}

function humanFighter(level, wanted) {
  return {
    targets: targets(wanted),
    level,
    keyAttribute: "str",
    ancestry: { slots: [FREE, FREE, []], flaws: [], alternate: true },
    background: { slots: [["str", "con"], FREE] },
    classKeys: ["str", "dex"]
  };
}

function elfWizard(level, wanted) {
  return {
    targets: targets(wanted),
    level,
    keyAttribute: "int",
    ancestry: { slots: [["dex"], ["int"], FREE], flaws: ["con"], alternate: true },
    background: { slots: [["int", "wis"], FREE] },
    classKeys: ["int"]
  };
}

test("a fighter's final modifiers are reproduced with every boost spent", () => {
  const input = humanFighter(5, { str: 4, dex: 3, con: 3, wis: 2 });
  const plan = boostPlan(input);
  assert.notEqual(plan, null);
  assert.equal(plan.unspent, 0);
  assert.equal(plan.keyAttribute, "str");
  assert.deepEqual(derive(input, plan), input.targets);
  assert.deepEqual(Object.keys(plan.boosts), ["1", "5"]);
  assert.equal(plan.boosts["1"].length, 4);
  assert.equal(plan.boosts["5"].length, 4);
  assert.ok(["str", "con"].includes(plan.background.selected["0"]));
  assert.equal(plan.ancestry.selected["2"], undefined);
});

test("fixed ancestry boosts and a flaw are kept and the wizard key attribute is used", () => {
  const input = elfWizard(5, { str: 1, dex: 3, con: 2, int: 4, wis: 2 });
  const plan = boostPlan(input);
  assert.notEqual(plan, null);
  assert.equal(plan.ancestry.selected["0"], "dex");
  assert.equal(plan.ancestry.selected["1"], "int");
  assert.equal(plan.keyAttribute, "int");
  assert.equal(plan.unspent, 0);
  assert.deepEqual(derive(input, plan), input.targets);
});

test("from +4 a later boost adds half, so an attribute at +4 accepts either count", () => {
  assert.deepEqual(laterBoostCounts(4, 4, 2), [0, 1]);
  assert.deepEqual(laterBoostCounts(4, 5, 2), [2]);
  assert.deepEqual(laterBoostCounts(3, 4, 2), [1, 2]);
  assert.deepEqual(laterBoostCounts(0, 3, 2), []);
  assert.deepEqual(laterBoostCounts(-1, -1, 1), [0]);
});

test("a level 10 plan uses partial boosts above +4", () => {
  const input = humanFighter(10, { str: 5, dex: 4, con: 4, wis: 2, int: 1 });
  const plan = boostPlan(input);
  assert.notEqual(plan, null);
  assert.deepEqual(Object.keys(plan.boosts), ["1", "5", "10"]);
  assert.equal(plan.unspent, 0);
  assert.deepEqual(derive(input, plan), input.targets);
  for (const level of ["5", "10"]) assert.equal(new Set(plan.boosts[level]).size, plan.boosts[level].length);
});

test("targets that leave later boosts unused give a plan with unspent boosts", () => {
  const input = humanFighter(5, { str: 3, dex: 2, con: 2, int: 1, wis: 1 });
  const plan = boostPlan(input);
  assert.notEqual(plan, null);
  assert.ok(plan.unspent > 0);
  assert.deepEqual(derive(input, plan), input.targets);
});

test("a +4 attribute absorbs a later boost before one is left unspent", () => {
  const input = humanFighter(5, { str: 4, dex: 3, con: 2, int: 1, wis: 1 });
  const plan = boostPlan(input);
  assert.equal(plan.unspent, 1);
  assert.deepEqual(derive(input, plan), input.targets);
});

test("targets needing more than four boosts in one level cannot be planned", () => {
  assert.equal(boostPlan(humanFighter(5, { str: 3, dex: 3, con: 3, int: 2, wis: 2, cha: 1 })), null);
});

test("picks that fail give way to a later pick that works", () => {
  const input = humanFighter(1, { str: 1, dex: 1, con: 1, int: 1, wis: 3, cha: 2 });
  const plan = boostPlan(input);
  assert.notEqual(plan, null);
  assert.deepEqual(derive(input, plan), input.targets);
  assert.deepEqual(plan.boosts, { "1": plan.boosts["1"] });
});

test("unreachable targets give no plan and the reason", () => {
  const input = humanFighter(1, { str: 7 });
  const plan = boostPlan(input);
  assert.equal(plan, null);
  assert.equal(manualReason(input, plan), "unreachable");
});

test("the gradual boost variant always uses manual attributes", () => {
  const input = { ...humanFighter(5, { str: 4, dex: 3, con: 3, wis: 2 }), gradual: true };
  assert.equal(boostPlan(input), null);
  assert.equal(manualReason(input, null), "gradual");
  assert.equal(manualReason(humanFighter(5, {}), { unspent: 0 }), null);
  assert.equal(boostPlan(null), null);
});

test("the alternate ancestry boosts are used when the standard ones cannot reach the targets", () => {
  const input = elfWizard(1, { dex: 2, con: 3, int: 3, wis: 1 });
  const plan = boostPlan(input);
  assert.notEqual(plan, null);
  assert.equal(plan.ancestry.alternate.length, 2);
  assert.equal(plan.ancestry.selected, undefined);
  assert.deepEqual(derive(input, plan), input.targets);
});

test("without an ancestry or background only the other boosts count", () => {
  const input = { targets: targets({ str: 2, dex: 1, con: 1, int: 1 }), level: 1, keyAttribute: "", ancestry: null,
    background: null, classKeys: ["str"] };
  const plan = boostPlan(input);
  assert.deepEqual(plan.ancestry, { selected: {} });
  assert.deepEqual(plan.background, { selected: {} });
  assert.equal(plan.keyAttribute, "str");
  assert.deepEqual(derive(input, plan), input.targets);
});

test("manual abilities hold every attribute as a whole modifier", () => {
  assert.deepEqual(manualAbilities({ str: 4, dex: 2.7, con: "3" }), {
    str: { mod: 4 }, dex: { mod: 2 }, con: { mod: 0 }, int: { mod: 0 }, wis: { mod: 0 }, cha: { mod: 0 }
  });
  assert.deepEqual(manualAbilities(null).cha, { mod: 0 });
});

test("the solver input is read from the recipe and the boost slots of the sources", () => {
  const ancestry = { system: { boosts: { "1": { value: ["int"] }, "0": { value: ["dex"] }, "2": { value: FREE } },
    flaws: { "0": { value: ["con"] }, "1": { value: [] } } } };
  const background = { system: { boosts: { "0": { value: ["int", "wis"] }, "1": { value: FREE } } } };
  const cls = { system: { keyAbility: { value: ["int"], selected: null } } };
  const recipe = { level: 5, keyAttribute: "int", attributes: { int: 4 } };
  assert.deepEqual(boostInput({ recipe, ancestry, background, cls, gradual: false }), {
    targets: { int: 4 },
    level: 5,
    keyAttribute: "int",
    ancestry: { slots: [["dex"], ["int"], FREE], flaws: ["con"], alternate: true },
    background: { slots: [["int", "wis"], FREE] },
    classKeys: ["int"],
    gradual: false
  });
  assert.equal(boostInput({ recipe, ancestry: null, background: null, cls: null, gradual: true }).ancestry, null);
});
