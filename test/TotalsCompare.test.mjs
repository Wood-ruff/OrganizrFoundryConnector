import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { totalsDifferences } from "../scripts/service/TotalsCompare.mjs";

function fixture(name) {
  return JSON.parse(readFileSync(new URL(`fixtures/${name}`, import.meta.url), "utf8"));
}

const expected = fixture("pf2e-recipe.json").expected;

test("equal totals have no differences", () => {
  assert.deepEqual(totalsDifferences(expected, structuredClone(expected)), []);
  const totals = fixture("pf2e-character-totals.json");
  assert.deepEqual(totalsDifferences(totals, structuredClone(totals)), []);
});

test("differences come in the pinned order with dotted keys", () => {
  const actual = structuredClone(expected);
  actual.strikes["Fist"].attack = 12;
  actual.spellcasting["Innate Gifts"] = { dc: 18, attack: 8 };
  actual.lores["warfare-lore"] = 9;
  actual.lores["library-lore"] = 11;
  actual.skills.thievery = 3;
  actual.skills.athletics = 14;
  actual.saves.will = 9;
  actual.abilities.cha = 1;
  actual.abilities.str = 5;
  actual.focusMax = 1;
  actual.speed = 30;
  actual.classDc = 22;
  actual.ac = 20;
  actual.level = 6;
  assert.deepEqual(totalsDifferences(expected, actual).map((difference) => difference.key), [
    "level", "ac", "classDc", "speed", "focusMax", "abilities.str", "abilities.cha", "saves.will",
    "skills.athletics", "skills.thievery", "lores.library-lore", "lores.warfare-lore",
    "spellcasting.Innate Gifts.dc", "spellcasting.Innate Gifts.attack", "strikes.Fist.attack"
  ]);
});

test("a difference carries both numbers", () => {
  const actual = { ...structuredClone(expected), ac: 22 };
  assert.deepEqual(totalsDifferences(expected, actual), [{ key: "ac", organizr: 19, foundry: 22 }]);
});

test("strikes and spellcasting follow Organizr's order", () => {
  const organizr = { strikes: { Zeta: { attack: 1 }, Alpha: { attack: 1 } }, spellcasting: { Zed: { dc: 10, attack: 1 },
    Ace: { dc: 10, attack: 1 } } };
  const foundry = { strikes: { Alpha: { attack: 2 }, Zeta: { attack: 2 } }, spellcasting: { Ace: { dc: 11, attack: 1 },
    Zed: { dc: 11, attack: 1 } } };
  assert.deepEqual(totalsDifferences(organizr, foundry).map((difference) => difference.key), [
    "spellcasting.Zed.dc", "spellcasting.Ace.dc", "strikes.Zeta.attack", "strikes.Alpha.attack"
  ]);
});

test("keys only one side has are not compared", () => {
  const organizr = { hp: 20, classDc: 18, skills: { arcana: 3 }, lores: { "tavern-lore": 1 },
    spellcasting: { "Innate Gifts": { dc: 17, attack: 7 } }, strikes: { Fist: { attack: 5 } } };
  const foundry = { hp: 20, speed: 25, skills: { arcana: 3, crafting: 4 }, lores: { "sailing-lore": 2 },
    spellcasting: { "Other Entry": { dc: 15, attack: 5 } }, strikes: { Dagger: { attack: 6 } } };
  assert.deepEqual(totalsDifferences(organizr, foundry), []);
});

test("non-numbers and inherited names are never compared", () => {
  const organizr = { hp: "20", ac: 18, strikes: { constructor: { attack: 4 } } };
  const foundry = { hp: 21, ac: Number.NaN, strikes: {} };
  assert.deepEqual(totalsDifferences(organizr, foundry), []);
});

test("missing totals on either side give no differences", () => {
  assert.deepEqual(totalsDifferences(expected, null), []);
  assert.deepEqual(totalsDifferences(undefined, expected), []);
});
