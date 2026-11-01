import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dnd5eDerivedTotals } from "../scripts/service/Dnd5eTotals.mjs";

function fixtureText(name) {
  return readFileSync(new URL(`fixtures/${name}`, import.meta.url), "utf8");
}

function fixture(name) {
  return JSON.parse(fixtureText(name));
}

function preparedNpc() {
  return fixture("dnd5e-npc-system.json");
}

function preparedCharacter() {
  return fixture("dnd5e-character-system.json");
}

function minimalSystem() {
  return { attributes: { ac: { value: 12 }, hp: { max: 9 }, prof: 2, init: { total: 1 } } };
}

test("a prepared dnd5e character gives the totals the server expects, key order included", () => {
  const totals = dnd5eDerivedTotals(preparedCharacter(), "modern");
  assert.deepEqual(totals, fixture("dnd5e-character-totals.json"));
  assert.equal(JSON.stringify(totals, null, 2), fixtureText("dnd5e-character-totals.json").trimEnd());
});

test("a prepared dnd5e NPC gives the totals the server expects, key order included", () => {
  const totals = dnd5eDerivedTotals(preparedNpc(), "modern");
  assert.deepEqual(totals, fixture("dnd5e-npc-totals.json"));
  assert.equal(JSON.stringify(totals, null, 2), fixtureText("dnd5e-npc-totals.json").trimEnd());
});

test("an NPC has no level but a CR and a caster level; a character has a level but neither", () => {
  const npc = dnd5eDerivedTotals(preparedNpc(), "modern");
  assert.equal("level" in npc, false);
  assert.equal(npc.cr, 5);
  assert.equal(npc.spell.level, 5);

  const character = dnd5eDerivedTotals(preparedCharacter(), "modern");
  assert.equal(character.level, 5);
  assert.equal("cr" in character, false);
  assert.equal("level" in character.spell, false);
  assert.equal(character.slots.pact, 0);
  assert.equal(character.slots.pactLevel, 0);
});

test("the rules version passes through as given; anything but text becomes empty", () => {
  assert.equal(dnd5eDerivedTotals(minimalSystem(), "legacy").rules, "legacy");
  assert.equal(dnd5eDerivedTotals(minimalSystem(), "modern").rules, "modern");
  assert.equal(dnd5eDerivedTotals(minimalSystem(), undefined).rules, "");
  assert.equal(dnd5eDerivedTotals(minimalSystem(), 2024).rules, "");
});

test("totals are null when AC, max HP, proficiency or initiative is not a number", () => {
  const missingAc = minimalSystem();
  delete missingAc.attributes.ac.value;
  const textHp = minimalSystem();
  textHp.attributes.hp.max = "9";
  const nanProf = minimalSystem();
  nanProf.attributes.prof = Number.NaN;
  const missingInit = minimalSystem();
  delete missingInit.attributes.init;
  for (const system of [missingAc, textHp, nanProf, missingInit, {}, null, undefined]) {
    assert.equal(dnd5eDerivedTotals(system, "modern"), null);
  }
});

test("a sparse system still lists all six abilities, all 18 skills and every slot key, at zero", () => {
  const totals = dnd5eDerivedTotals(minimalSystem(), "modern");
  assert.deepEqual(Object.keys(totals), ["rules", "ac", "hp", "prof", "init", "exhaustion", "abilities", "skills", "tools", "spell", "slots"]);
  assert.deepEqual(totals.abilities.wis, { score: 0, mod: 0, save: 0 });
  assert.equal(Object.keys(totals.abilities).length, 6);
  assert.equal(Object.keys(totals.skills).length, 18);
  assert.deepEqual(totals.skills.sur, { total: 0, passive: 0 });
  assert.deepEqual(totals.tools, {});
  assert.deepEqual(totals.spell, { dc: 0, attack: 0 });
  assert.deepEqual(Object.keys(totals.slots), [
    "spell1", "spell2", "spell3", "spell4", "spell5", "spell6", "spell7", "spell8", "spell9", "pact", "pactLevel"
  ]);
  assert.equal(totals.exhaustion, 0);
});

test("numbers are whole except the CR; a fractional CR stays as dnd5e keeps it", () => {
  const system = minimalSystem();
  system.attributes.ac.value = 14.5;
  system.attributes.movement = { speeds: { walk: 27.5 } };
  system.attributes.exhaustion = 2;
  system.details = { level: 0, cr: 0.125 };
  const totals = dnd5eDerivedTotals(system, "modern");
  assert.equal(totals.ac, 14);
  assert.equal(totals.speed, 27);
  assert.equal(totals.cr, 0.125);
  assert.equal(totals.exhaustion, 2);
  assert.equal("level" in totals, false);
});

test("an empty spellcasting ability and an unset walking speed are left out", () => {
  const system = minimalSystem();
  system.attributes.spellcasting = "";
  system.attributes.movement = { speeds: { walk: null } };
  system.attributes.exhaustion = Number.NaN;
  system.details = { level: Number.NaN, cr: null };
  const totals = dnd5eDerivedTotals(system, "modern");
  assert.equal("ability" in totals.spell, false);
  assert.equal("speed" in totals, false);
  assert.equal("level" in totals, false);
  assert.equal("cr" in totals, false);
  assert.equal(totals.exhaustion, 0);
});

test("every tool key gives its total", () => {
  const system = minimalSystem();
  system.tools = { smith: { total: 5 }, herb: { total: 2.9 }, odd: { total: "3" } };
  assert.deepEqual(dnd5eDerivedTotals(system, "modern").tools, { smith: 5, herb: 2, odd: 0 });
});

test("the captured exhausted character keeps exhaustion 1 and the reduced speed", () => {
  const totals = dnd5eDerivedTotals(preparedCharacter(), "modern");
  assert.equal(totals.exhaustion, 1);
  assert.equal(totals.speed, 25);
  assert.deepEqual(totals.tools, { cartographer: 4 });
});
