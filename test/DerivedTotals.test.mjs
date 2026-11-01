import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { derivedTotalsFor, sendsDerivedTotals } from "../scripts/service/DerivedTotals.mjs";

function fixture(name) {
  return JSON.parse(readFileSync(new URL(`fixtures/${name}`, import.meta.url), "utf8"));
}

function actorOf(type, system) {
  return { documentName: "Actor", type, system };
}

test("totals are sent for NPC and character actors in a pf1 or dnd5e world", () => {
  for (const systemId of ["pf1", "dnd5e"]) {
    assert.equal(sendsDerivedTotals(systemId, "Actor", "npc"), true, systemId);
    assert.equal(sendsDerivedTotals(systemId, "Actor", "character"), true, systemId);
    assert.equal(sendsDerivedTotals(systemId, "Item", "npc"), false, systemId);
  }
  assert.equal(sendsDerivedTotals("pf1", "Actor", "basic"), false);
  assert.equal(sendsDerivedTotals("dnd5e", "Actor", "vehicle"), false);
  assert.equal(sendsDerivedTotals("dnd5e", "Actor", "group"), false);
  assert.equal(sendsDerivedTotals(undefined, "Actor", "npc"), false);
});

test("a pf2e world sends totals for character actors only", () => {
  assert.equal(sendsDerivedTotals("pf2e", "Actor", "character"), true);
  assert.equal(sendsDerivedTotals("pf2e", "Actor", "npc"), false);
  assert.equal(sendsDerivedTotals("pf2e", "Actor", "loot"), false);
  assert.equal(sendsDerivedTotals("pf2e", "Item", "character"), false);
});

test("derivedTotalsFor reads a pf2e character's totals from the prepared actor itself", () => {
  const character = {
    documentName: "Actor", type: "character", level: 2,
    hitPoints: { max: 30 }, armorClass: { value: 17 }, perception: { mod: 6 },
    saves: { fortitude: { mod: 7 }, reflex: { mod: 5 }, will: { mod: 4 } },
    system: {}
  };

  const totals = derivedTotalsFor("pf2e", character);

  assert.equal(totals.hp, 30);
  assert.equal(totals.ac, 17);
  assert.deepEqual(totals.saves, { fortitude: 7, reflex: 5, will: 4 });
  assert.equal(derivedTotalsFor("pf2e", { ...character, type: "npc" }), null);
  assert.equal(derivedTotalsFor("pf2e", { ...character, hitPoints: null }), null);
});

test("derivedTotalsFor gives a pf1 character's or NPC's totals and null for anything else", () => {
  const character = actorOf("character", fixture("pf1-character-system.json"));
  assert.deepEqual(derivedTotalsFor("pf1", character), fixture("pf1-character-totals.json"));
  assert.deepEqual(derivedTotalsFor("pf1", character, "modern"), fixture("pf1-character-totals.json"));
  assert.equal(derivedTotalsFor("pf2e", character), null);
  assert.equal(derivedTotalsFor("pf1", { ...character, documentName: "Item" }), null);
  assert.equal(derivedTotalsFor("pf1", actorOf("character", {})), null);
  assert.equal(derivedTotalsFor("pf1", null), null);
});

test("derivedTotalsFor gives a dnd5e character's and NPC's totals under the given rules version", () => {
  const character = actorOf("character", fixture("dnd5e-character-system.json"));
  const npc = actorOf("npc", fixture("dnd5e-npc-system.json"));
  assert.deepEqual(derivedTotalsFor("dnd5e", character, "modern"), fixture("dnd5e-character-totals.json"));
  assert.deepEqual(derivedTotalsFor("dnd5e", npc, "modern"), fixture("dnd5e-npc-totals.json"));
  assert.equal(derivedTotalsFor("dnd5e", npc, "legacy").rules, "legacy");
});

test("a dnd5e world sends no totals for other documents or for actors without the core numbers", () => {
  const npc = actorOf("npc", fixture("dnd5e-npc-system.json"));
  assert.equal(derivedTotalsFor("dnd5e", { ...npc, documentName: "Item" }, "modern"), null);
  assert.equal(derivedTotalsFor("dnd5e", { ...npc, type: "vehicle" }, "modern"), null);
  assert.equal(derivedTotalsFor("dnd5e", actorOf("npc", {}), "modern"), null);
  assert.equal(derivedTotalsFor("pf1", npc, "modern"), null);
});
