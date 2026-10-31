import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { derivedTotalsFor, pf1DerivedTotals, sendsDerivedTotals } from "../scripts/service/Pf1Totals.mjs";

const NPC_KEYS = ["ac", "touchAc", "flatFootedAc", "hp", "bab", "cmb", "cmd", "init", "fort", "ref", "will", "skills"];

function fixture(name) {
  return JSON.parse(readFileSync(new URL(`fixtures/${name}`, import.meta.url), "utf8"));
}

function npcPart(totals) {
  return Object.fromEntries(NPC_KEYS.map((key) => [key, totals[key]]));
}

function preparedCharacter() {
  return fixture("pf1-character-system.json");
}

function preparedNpc() {
  return {
    attributes: {
      ac: { normal: { total: 17 }, touch: { total: 11 }, flatFooted: { total: 16 } },
      hp: { max: 22, value: 15, offset: -7, temp: 0, nonlethal: 0 },
      bab: { total: 3 },
      cmb: { total: 5 },
      cmd: { total: 16, flatFootedTotal: 15 },
      init: { total: 1 },
      savingThrows: { fort: { total: 4 }, ref: { total: 2 }, will: { total: 1 } }
    },
    skills: {
      per: { ability: "wis", rank: 4, mod: 7 },
      ste: { ability: "dex", rank: 0, mod: -1 },
      crf: { ability: "int", rank: 0, mod: 0, subSkills: { crf1: { mod: 3 } } },
      lor: { ability: "int", rank: 0 }
    }
  };
}

test("the NPC part of a prepared pf1 NPC's totals keeps its keys and values", () => {
  const totals = pf1DerivedTotals(preparedNpc());
  assert.deepEqual(npcPart(totals), {
    ac: 17, touchAc: 11, flatFootedAc: 16, hp: 22, bab: 3, cmb: 5, cmd: 16, init: 1, fort: 4, ref: 2, will: 1,
    skills: { per: 7, ste: -1, crf: 0, "crf.crf1": 3 }
  });
});

test("an NPC without abilities, speed, level or spellbooks sends empty maps and no speed or level", () => {
  const totals = pf1DerivedTotals(preparedNpc());
  assert.deepEqual(totals.abilities, {});
  assert.deepEqual(totals.spellbooks, {});
  assert.equal("speed" in totals, false);
  assert.equal("level" in totals, false);
});

test("the snapshot keys come in the documented order", () => {
  assert.deepEqual(Object.keys(pf1DerivedTotals(preparedCharacter())),
    [...NPC_KEYS, "abilities", "speed", "level", "spellbooks"]);
});

test("the prepared fixture character gives the committed totals", () => {
  assert.deepEqual(pf1DerivedTotals(preparedCharacter()), fixture("pf1-character-totals.json"));
});

test("sub-skills are keyed parent.tag and custom skills by their key verbatim", () => {
  const system = preparedCharacter();
  system.skills.crf.subSkills.alchemy = { mod: 5 };
  const skills = pf1DerivedTotals(system).skills;
  assert.equal(skills["crf.alchemy"], 5);
  assert.equal(skills["crf.crf1"], 8);
  assert.equal(skills.crf, 5);
  assert.equal(skills.newSkill, 4);
  assert.deepEqual(Object.keys(skills).slice(5, 9), ["crf", "crf.crf1", "crf.alchemy", "dip"]);
});

test("ability totals, land speed and level come from the prepared values", () => {
  const system = preparedCharacter();
  system.abilities.str.total = 18.5;
  system.attributes.speed.land.total = 20;
  system.details.level.value = 7;
  const totals = pf1DerivedTotals(system);
  assert.equal(totals.abilities.str, 18);
  assert.equal(totals.speed, 20);
  assert.equal(totals.level, 7);
});

test("a non-numeric ability, speed or level is left out without dropping the snapshot", () => {
  const system = preparedCharacter();
  system.abilities.cha.total = null;
  system.attributes.speed.land.total = "40";
  delete system.details.level;
  const totals = pf1DerivedTotals(system);
  assert.equal("cha" in totals.abilities, false);
  assert.equal("speed" in totals, false);
  assert.equal("level" in totals, false);
  assert.equal(totals.ac, 17);
});

test("only spellbooks in use are sent", () => {
  const system = preparedCharacter();
  assert.deepEqual(Object.keys(pf1DerivedTotals(system).spellbooks), ["primary"]);
  system.attributes.spells.spellbooks.secondary.inUse = true;
  system.attributes.spells.spellbooks.primary.inUse = false;
  assert.deepEqual(pf1DerivedTotals(system).spellbooks, {
    secondary: { cl: 1, concentration: 2, abilityMod: 3, slots: {} }
  });
});

test("a book's ability modifier is the floored modifier of its casting ability", () => {
  const system = preparedCharacter();
  const book = system.attributes.spells.spellbooks.primary;
  book.ability = "cha";
  assert.equal(pf1DerivedTotals(system).spellbooks.primary.abilityMod, -1);
  system.abilities.cha.mod = 1.5;
  assert.equal(pf1DerivedTotals(system).spellbooks.primary.abilityMod, 1);
});

test("a book without a caster level, concentration or casting ability is left out", () => {
  const noAbility = preparedCharacter();
  noAbility.attributes.spells.spellbooks.primary.ability = "";
  assert.deepEqual(pf1DerivedTotals(noAbility).spellbooks, {});
  const noCasterLevel = preparedCharacter();
  delete noCasterLevel.attributes.spells.spellbooks.primary.cl;
  assert.deepEqual(pf1DerivedTotals(noCasterLevel).spellbooks, {});
  const textConcentration = preparedCharacter();
  textConcentration.attributes.spells.spellbooks.primary.concentration.total = "8";
  assert.deepEqual(pf1DerivedTotals(textConcentration).spellbooks, {});
});

test("slots are the finite spell level maxima, floored", () => {
  const system = preparedCharacter();
  const spells = system.attributes.spells.spellbooks.primary.spells;
  spells.spell1.max = 2.7;
  spells.spell3.max = 1;
  spells.spell0.max = null;
  assert.deepEqual(pf1DerivedTotals(system).spellbooks.primary.slots, { 1: 2, 3: 1 });
});

test("a non-finite combat number on a character gives no snapshot", () => {
  const system = preparedCharacter();
  system.attributes.hp.max = Number.POSITIVE_INFINITY;
  assert.equal(pf1DerivedTotals(system), null);
});

test("fractional values are floored to whole numbers", () => {
  const system = preparedNpc();
  system.attributes.hp.max = 22.5;
  system.attributes.init.total = -0.5;
  system.skills.per.mod = 6.9;
  const totals = pf1DerivedTotals(system);
  assert.equal(totals.hp, 22);
  assert.equal(totals.init, -1);
  assert.equal(totals.skills.per, 6);
});

test("a missing or non-numeric stat gives no snapshot", () => {
  const missingSave = preparedNpc();
  delete missingSave.attributes.savingThrows.will;
  assert.equal(pf1DerivedTotals(missingSave), null);
  const textAc = preparedNpc();
  textAc.attributes.ac.normal.total = "17";
  assert.equal(pf1DerivedTotals(textAc), null);
  const nanCmd = preparedNpc();
  nanCmd.attributes.cmd.total = Number.NaN;
  assert.equal(pf1DerivedTotals(nanCmd), null);
  assert.equal(pf1DerivedTotals({}), null);
  assert.equal(pf1DerivedTotals(undefined), null);
});

test("an actor without skills sends an empty skill map", () => {
  const system = preparedNpc();
  delete system.skills;
  assert.deepEqual(pf1DerivedTotals(system).skills, {});
});

test("a skill or sub-skill without a numeric modifier is left out", () => {
  const system = preparedNpc();
  system.skills.crf.subSkills.crf2 = { mod: "4" };
  const skills = pf1DerivedTotals(system).skills;
  assert.equal("lor" in skills, false);
  assert.equal("crf.crf2" in skills, false);
});

test("totals are sent for NPC and character actors in a pf1 world only", () => {
  assert.equal(sendsDerivedTotals("pf1", "Actor", "npc"), true);
  assert.equal(sendsDerivedTotals("pf1", "Actor", "character"), true);
  assert.equal(sendsDerivedTotals("pf1", "Actor", "basic"), false);
  assert.equal(sendsDerivedTotals("pf2e", "Actor", "character"), false);
  assert.equal(sendsDerivedTotals("pf1", "Item", "npc"), false);
  assert.equal(sendsDerivedTotals("pf2e", "Actor", "npc"), false);
  assert.equal(sendsDerivedTotals("dnd5e", "Actor", "npc"), false);
});

test("derivedTotalsFor gives a pf1 character's or NPC's totals and null for anything else", () => {
  const character = { documentName: "Actor", type: "character", system: preparedCharacter() };
  assert.deepEqual(derivedTotalsFor("pf1", character), fixture("pf1-character-totals.json"));
  assert.equal(derivedTotalsFor("pf2e", character), null);
  assert.equal(derivedTotalsFor("pf1", { ...character, documentName: "Item" }), null);
  assert.equal(derivedTotalsFor("pf1", { documentName: "Actor", type: "character", system: {} }), null);
  assert.equal(derivedTotalsFor("pf1", null), null);
});
