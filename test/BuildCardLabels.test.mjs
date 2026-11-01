import { test } from "node:test";
import assert from "node:assert/strict";
import { differenceLabel } from "../scripts/service/BuildCardLabels.mjs";

test("fixed totals keys name their lang key", () => {
  assert.deepEqual(differenceLabel("ac"), { langKey: "ORGANIZR.Build.Totals.ac", data: {} });
  assert.deepEqual(differenceLabel("abilities.str"), { langKey: "ORGANIZR.Build.Totals.abilities.str", data: {} });
  assert.deepEqual(differenceLabel("saves.will"), { langKey: "ORGANIZR.Build.Totals.saves.will", data: {} });
  assert.deepEqual(differenceLabel("focusMax"), { langKey: "ORGANIZR.Build.Totals.focusMax", data: {} });
});

test("skills name pf2e's skill and lores their key words", () => {
  assert.deepEqual(differenceLabel("skills.athletics"), { skill: "athletics" });
  assert.deepEqual(differenceLabel("lores.warfare-lore"), { text: "Warfare Lore" });
});

test("spellcasting and strike keys carry the entry or strike name, dots included", () => {
  assert.deepEqual(differenceLabel("spellcasting.Arcane Prepared Spells.dc"),
    { langKey: "ORGANIZR.Build.Totals.SpellDc", data: { name: "Arcane Prepared Spells" } });
  assert.deepEqual(differenceLabel("spellcasting.Gifts.attack"),
    { langKey: "ORGANIZR.Build.Totals.SpellAttack", data: { name: "Gifts" } });
  assert.deepEqual(differenceLabel("strikes.+1 Oak St. Staff.attack"),
    { langKey: "ORGANIZR.Build.Totals.StrikeAttack", data: { name: "+1 Oak St. Staff" } });
});

test("unknown or nameless keys stay as they are", () => {
  assert.deepEqual(differenceLabel("strikes..attack"), { text: "strikes..attack" });
  assert.deepEqual(differenceLabel("initiative"), { text: "initiative" });
  assert.deepEqual(differenceLabel(undefined), { text: "" });
});
