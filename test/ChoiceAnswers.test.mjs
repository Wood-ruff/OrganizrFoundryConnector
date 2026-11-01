import { test } from "node:test";
import assert from "node:assert/strict";
import { answerChoice, unansweredChoices } from "../scripts/service/ChoiceAnswers.mjs";
import { markCovered, recipeEvidence } from "../scripts/service/Pf2eRecipe.mjs";
import { sluggify } from "./support/sluggify.mjs";

function prompt(itemName, labels, { sourceId = null, values = null } = {}) {
  const choices = labels.map((label, index) => ({ value: values ? values[index] : sluggify(label), label }));
  return { itemName, sourceId, choices };
}

function evidenceOf(recipe, previous) {
  return recipeEvidence(recipe, sluggify, previous);
}

test("a previous selection wins over every other hint", () => {
  const sourceId = "Compendium.pf2e.classfeatures.Item.invented";
  const previous = new Map([[sourceId, new Set(["axe"])]]);
  const evidence = evidenceOf({ features: [{ name: "Blade Training (Sword)", level: 1 }] }, previous);
  const answer = answerChoice(prompt("Blade Training", ["Sword", "Axe"], { sourceId }), evidence, sluggify);
  assert.deepEqual(answer, { index: 1, how: "previous" });
});

test("a previous object value matches by its JSON", () => {
  const sourceId = "Compendium.pf2e.feats-srd.Item.invented";
  const previous = new Map([[sourceId, new Set([{ group: "bow", tier: 1 }])]]);
  const values = [{ group: "sword", tier: 1 }, { group: "bow", tier: 1 }];
  const answer = answerChoice(prompt("Range Drill", ["Sword", "Bow"], { sourceId, values }), evidenceOf({}, previous),
    sluggify);
  assert.deepEqual(answer, { index: 1, how: "previous" });
});

test("a previous selection of another source is no hint", () => {
  const previous = new Map([["Compendium.pf2e.feats-srd.Item.other", new Set(["axe"])]]);
  const answer = answerChoice(prompt("Blade Training", ["Sword", "Axe"], { sourceId: "x" }), evidenceOf({}, previous),
    sluggify);
  assert.deepEqual(answer, { index: 0, how: "default" });
});

test("the suffix of the recipe name picks its label", () => {
  const evidence = evidenceOf({ features: [{ name: "Fighter Weapon Mastery (Sword)", category: "classfeature" }] });
  const answer = answerChoice(prompt("Fighter Weapon Mastery", ["Axe", "Bow", "Sword"]), evidence, sluggify);
  assert.deepEqual(answer, { index: 2, how: "suffix" });
});

test("an uncovered recipe name beats a covered one", () => {
  const evidence = evidenceOf({ features: [{ name: "Quick Guard", level: 1 }, { name: "Iron Will", level: 1 }] });
  markCovered(evidence, "Quick Guard", sluggify);
  const answer = answerChoice(prompt("Heritage Gift", ["Quick Guard", "Iron Will"]), evidence, sluggify);
  assert.deepEqual(answer, { index: 1, how: "uncovered" });
});

test("of two uncovered names the lower recipe level wins, no level last", () => {
  const evidence = evidenceOf({
    features: [{ name: "Iron Will", level: 3 }, { name: "Quick Guard", level: 1 }],
    actions: [{ name: "Swift Parry" }]
  });
  const answer = answerChoice(prompt("Heritage Gift", ["Swift Parry", "Iron Will", "Quick Guard"]), evidence, sluggify);
  assert.deepEqual(answer, { index: 2, how: "uncovered" });
  const noLevel = answerChoice(prompt("Heritage Gift", ["Swift Parry", "Iron Will"]), evidence, sluggify);
  assert.deepEqual(noLevel, { index: 1, how: "uncovered" });
});

test("uncovered names of the same level keep choice order", () => {
  const evidence = evidenceOf({ features: [{ name: "Iron Will", level: 1 }, { name: "Quick Guard", level: 1 }] });
  const answer = answerChoice(prompt("Heritage Gift", ["Quick Guard", "Iron Will"]), evidence, sluggify);
  assert.deepEqual(answer, { index: 0, how: "uncovered" });
});

test("a covered recipe name still beats no hint", () => {
  const evidence = evidenceOf({ features: [{ name: "Iron Will", level: 1 }] });
  markCovered(evidence, "Iron Will", sluggify);
  const answer = answerChoice(prompt("Heritage Gift", ["Quick Guard", "Iron Will"]), evidence, sluggify);
  assert.deepEqual(answer, { index: 1, how: "name" });
});

test("skill choices take the highest recipe rank", () => {
  const evidence = evidenceOf({ skills: { acrobatics: 1, athletics: 2, stealth: 2 } });
  const answer = answerChoice(prompt("Class Skill", ["Acrobatics", "Athletics", "Stealth"]), evidence, sluggify);
  assert.deepEqual(answer, { index: 1, how: "skill" });
});

test("equal skill ranks keep choice order", () => {
  const evidence = evidenceOf({ skills: { acrobatics: 0, athletics: 0 } });
  const answer = answerChoice(prompt("Class Skill", ["Acrobatics", "Athletics"]), evidence, sluggify);
  assert.deepEqual(answer, { index: 0, how: "skill" });
});

test("choices that are not all skills get no skill answer", () => {
  const evidence = evidenceOf({ skills: { athletics: 4 } });
  const answer = answerChoice(prompt("Mixed", ["Sword", "Athletics"]), evidence, sluggify);
  assert.deepEqual(answer, { index: 0, how: "default" });
});

test("without evidence the first choice is the default", () => {
  const answer = answerChoice(prompt("Weapon Group", ["Axe", "Bow"]), evidenceOf({}), sluggify);
  assert.deepEqual(answer, { index: 0, how: "default" });
});

test("a prompt without choices gets no answer", () => {
  assert.equal(answerChoice({ itemName: "Empty", sourceId: null, choices: [] }, evidenceOf({}), sluggify), null);
  assert.equal(answerChoice({ itemName: "Empty" }, evidenceOf({}), sluggify), null);
});

test("unanswered choices are null-closed prompts and ignored ChoiceSet rules", () => {
  const prompts = [
    { item: "Weapon Drill", choice: null, how: null },
    { item: "Class Skill", choice: "athletics", how: "skill" }
  ];
  const sources = [
    { name: "Weapon Drill", system: { rules: [{ key: "ChoiceSet", ignored: true }] } },
    { name: "Hidden Talent", system: { rules: [{ key: "ChoiceSet", flag: "talent", ignored: true }] } },
    { name: "Predicate Failed", system: { rules: [{ key: "ChoiceSet", flag: "gated" }] } },
    { name: "Other Rule", system: { rules: [{ key: "FlatModifier", ignored: true }] } },
    { name: "No Rules", system: {} }
  ];
  assert.deepEqual(unansweredChoices(prompts, sources), [{ item: "Weapon Drill" }, { item: "Hidden Talent" }]);
  assert.deepEqual(unansweredChoices(null, null), []);
});
