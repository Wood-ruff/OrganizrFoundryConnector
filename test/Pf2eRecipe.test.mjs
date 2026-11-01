import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  RECIPE_FORMAT, RECIPE_VERSION, baseName, markCovered, recipeErrorKey, recipeEvidence
} from "../scripts/service/Pf2eRecipe.mjs";
import { sluggify } from "./support/sluggify.mjs";

const recipe = JSON.parse(readFileSync(new URL("fixtures/pf2e-recipe.json", import.meta.url), "utf8"));
const VERSION_ERROR = "ORGANIZR.Build.Errors.RecipeVersion";

test("the shared recipe is a recipe this connector builds", () => {
  assert.equal(RECIPE_FORMAT, "organizr-pf2e-recipe");
  assert.equal(RECIPE_VERSION, 1);
  assert.equal(recipeErrorKey({ document: { name: recipe.name }, recipe }), null);
});

test("another format or version is refused with the update hint", () => {
  assert.equal(recipeErrorKey({ recipe: { ...recipe, format: "other-recipe" } }), VERSION_ERROR);
  assert.equal(recipeErrorKey({ recipe: { ...recipe, version: 2 } }), VERSION_ERROR);
  assert.equal(recipeErrorKey({ recipe: { ...recipe, version: "1" } }), VERSION_ERROR);
});

test("an answer without a recipe is refused", () => {
  assert.equal(recipeErrorKey({ document: {} }), VERSION_ERROR);
  assert.equal(recipeErrorKey({ recipe: null }), VERSION_ERROR);
  assert.equal(recipeErrorKey({ recipe: [] }), VERSION_ERROR);
  assert.equal(recipeErrorKey(null), VERSION_ERROR);
});

test("a trailing parenthesis is the suffix of a base name", () => {
  assert.deepEqual(baseName("Fighter Weapon Mastery (Sword)"), { base: "Fighter Weapon Mastery", suffix: "Sword" });
  assert.deepEqual(baseName("  Scholar (Occultism)  "), { base: "Scholar", suffix: "Occultism" });
});

test("a name without a trailing parenthesis is its own base", () => {
  assert.deepEqual(baseName("Toughness"), { base: "Toughness", suffix: null });
  assert.deepEqual(baseName("Rope (Hemp) Coil"), { base: "Rope (Hemp) Coil", suffix: null });
  assert.deepEqual(baseName("Blank ( )"), { base: "Blank ( )", suffix: null });
  assert.deepEqual(baseName(null), { base: "", suffix: null });
});

test("evidence takes suffixes from identity and feature names", () => {
  const evidence = recipeEvidence(recipe, sluggify);
  assert.deepEqual([...evidence.suffixes.keys()], ["scholar"]);
  assert.deepEqual([...evidence.suffixes.get("scholar")], ["occultism"]);
});

test("evidence names every recipe entry by slug, a suffixed one also by its base", () => {
  const evidence = recipeEvidence(recipe, sluggify);
  for (const slug of [
    "human", "versatile-human", "scholar-occultism", "scholar", "fighter", "steadfast-guard", "toughness",
    "keen-recall", "shield-shove", "quick-step", "glimmer-spark", "dancing-mote", "cinder-blade", "satchel",
    "brass-lantern", "rations", "lost-charm", "warfare-lore", "library"
  ]) {
    assert.ok(evidence.names.has(slug), slug);
    assert.ok(evidence.uncovered.has(slug), slug);
  }
  assert.equal(evidence.names.size, 19);
});

test("evidence keeps the lowest feature level per slug", () => {
  const evidence = recipeEvidence(recipe, sluggify);
  assert.deepEqual(Object.fromEntries(evidence.levels), { "steadfast-guard": 2, toughness: 3, "keen-recall": 2 });
  const twice = recipeEvidence({
    features: [{ name: "Rapid Mend", level: 7 }, { name: "Rapid Mend", level: 3 }]
  }, sluggify);
  assert.equal(twice.levels.get("rapid-mend"), 3);
});

test("evidence reads the 16 skill ranks, missing ones as untrained", () => {
  const evidence = recipeEvidence(recipe, sluggify);
  assert.equal(evidence.skillRanks.size, 16);
  assert.equal(evidence.skillRanks.get("athletics"), 2);
  assert.equal(evidence.skillRanks.get("occultism"), 1);
  assert.equal(evidence.skillRanks.get("arcana"), 0);
  assert.equal(recipeEvidence({}, sluggify).skillRanks.get("stealth"), 0);
});

test("evidence keeps the previous selections it is given", () => {
  const previous = new Map([["Compendium.pf2e.classes.Item.invented", new Set(["athletics"])]]);
  assert.equal(recipeEvidence(recipe, sluggify, previous).previous, previous);
  assert.equal(recipeEvidence(recipe, sluggify).previous.size, 0);
});

test("a spell or gear entry with its own document gives no suffix hint", () => {
  const evidence = recipeEvidence({
    spellcasting: [{ spells: [{ name: "Ember Ring (Greater)", document: { type: "spell" } }] }],
    inventory: [
      { name: "Glass Blade (Silver)", document: { type: "weapon" } },
      { name: "Rope Coil (Hemp)", document: null }
    ]
  }, sluggify);
  assert.deepEqual([...evidence.suffixes.keys()], ["rope-coil"]);
  assert.ok(evidence.names.has("glass-blade-silver"));
  assert.ok(!evidence.names.has("glass-blade"));
});

test("covered names leave the uncovered slugs, a suffixed one with its base", () => {
  const evidence = recipeEvidence(recipe, sluggify);
  markCovered(evidence, "Toughness", sluggify);
  markCovered(evidence, "Scholar (Occultism)", sluggify);
  assert.ok(!evidence.uncovered.has("toughness"));
  assert.ok(!evidence.uncovered.has("scholar-occultism"));
  assert.ok(!evidence.uncovered.has("scholar"));
  assert.ok(evidence.names.has("toughness"));
});
