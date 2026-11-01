import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pf2eDerivedTotals } from "../scripts/service/Pf2eTotals.mjs";

const expectedTotals = JSON.parse(readFileSync(new URL("fixtures/pf2e-character-totals.json", import.meta.url), "utf8"));

function modifiers(values) {
  const statistics = {};
  for (const [key, mod] of Object.entries(values)) statistics[key] = { mod };
  return statistics;
}

function preparedFighter() {
  return {
    documentName: "Actor",
    type: "character",
    level: 5,
    hitPoints: { value: 60, max: 78, temp: 0 },
    armorClass: { value: 22 },
    perception: { mod: 11 },
    classDC: { slug: "fighter", dc: { value: 21 }, mod: 11 },
    abilities: modifiers({ str: 4, dex: 3, con: 3, int: 0, wis: 2, cha: 0 }),
    saves: modifiers({ fortitude: 12, reflex: 12, will: 11 }),
    skills: {
      ...modifiers(expectedTotals.skills),
      "warfare-lore": { mod: 7, lore: true }
    },
    itemTypes: {
      spellcastingEntry: [
        { name: "Arcane Prepared Spells", statistic: { mod: 11, dc: { value: 21 } } },
        { name: "Arcane Prepared Spells", statistic: { mod: 3, dc: { value: 13 } } },
        { name: "Unready Notes", statistic: null }
      ]
    },
    system: {
      movement: { speeds: { land: { value: 30 } } },
      resources: { focus: { value: 0, max: 0 } },
      actions: [
        { type: "strike", label: "+1 Longsword", totalModifier: 16 },
        { type: "strike", label: "+1 Longsword", totalModifier: 2 },
        { type: "action", label: "Invented Flourish", totalModifier: 30 }
      ]
    }
  };
}

test("a prepared pf2e character gives the shared totals", () => {
  assert.deepEqual(pf2eDerivedTotals(preparedFighter()), expectedTotals);
});

test("no totals when HP, AC, perception or a save is not a number", () => {
  const withoutHp = { ...preparedFighter(), hitPoints: { max: undefined } };
  assert.equal(pf2eDerivedTotals(withoutHp), null);
  assert.equal(pf2eDerivedTotals({ ...preparedFighter(), armorClass: null }), null);
  assert.equal(pf2eDerivedTotals({ ...preparedFighter(), perception: { mod: Number.NaN } }), null);
  const withoutWill = { ...preparedFighter(), saves: modifiers({ fortitude: 12, reflex: 12 }) };
  assert.equal(pf2eDerivedTotals(withoutWill), null);
  assert.equal(pf2eDerivedTotals(null), null);
});

test("a skill without a finite modifier is left out", () => {
  const actor = preparedFighter();
  actor.skills.thievery = { mod: Number.POSITIVE_INFINITY };
  actor.skills.stealth = { mod: "3" };

  const skills = pf2eDerivedTotals(actor).skills;

  assert.equal("thievery" in skills, false);
  assert.equal("stealth" in skills, false);
  assert.equal(skills.athletics, 13);
});

test("lores are the lore statistics among the skills, keyed by their own key", () => {
  const actor = preparedFighter();
  actor.skills["sailing-lore"] = { mod: 5.6, lore: true };
  actor.skills["invented-trade"] = { mod: 4 };

  assert.deepEqual(pf2eDerivedTotals(actor).lores, { "warfare-lore": 7, "sailing-lore": 5 });
});

test("strikes come only from strike actions, the first of a label winning", () => {
  const actor = preparedFighter();
  actor.system.actions.push({ type: "strike", label: "Steel Fist", totalModifier: 13 }, { type: "strike", label: "Broken" });

  assert.deepEqual(pf2eDerivedTotals(actor).strikes, { "+1 Longsword": { attack: 16 }, "Steel Fist": { attack: 13 } });
});

test("a character without a class DC, speed, focus pool or level leaves those keys out", () => {
  const actor = { ...preparedFighter(), classDC: null, level: undefined, system: {} };

  const totals = pf2eDerivedTotals(actor);

  for (const key of ["classDc", "speed", "focusMax", "level"]) assert.equal(key in totals, false, key);
  assert.deepEqual(totals.spellcasting, expectedTotals.spellcasting);
  assert.deepEqual(totals.strikes, {});
});

test("an actor without entries, skills or abilities keeps empty maps", () => {
  const actor = { ...preparedFighter(), skills: undefined, abilities: undefined, itemTypes: {} };

  const totals = pf2eDerivedTotals(actor);

  assert.deepEqual(totals.skills, {});
  assert.deepEqual(totals.lores, {});
  assert.deepEqual(totals.abilities, {});
  assert.deepEqual(totals.spellcasting, {});
});
