import { test } from "node:test";
import assert from "node:assert/strict";
import { pf1DerivedTotals, sendsDerivedTotals } from "../scripts/service/Pf1Totals.mjs";

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

test("the totals of a prepared pf1 NPC in the snapshot shape", () => {
  assert.deepEqual(pf1DerivedTotals(preparedNpc()), {
    ac: 17, touchAc: 11, flatFootedAc: 16, hp: 22, bab: 3, cmb: 5, cmd: 16, init: 1, fort: 4, ref: 2, will: 1,
    skills: { per: 7, ste: -1, crf: 0 }
  });
});

test("the snapshot keys come in the documented order", () => {
  assert.deepEqual(Object.keys(pf1DerivedTotals(preparedNpc())),
    ["ac", "touchAc", "flatFootedAc", "hp", "bab", "cmb", "cmd", "init", "fort", "ref", "will", "skills"]);
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

test("totals are sent for NPC actors in a pf1 world only", () => {
  assert.equal(sendsDerivedTotals("pf1", "Actor", "npc"), true);
  assert.equal(sendsDerivedTotals("pf1", "Actor", "character"), false);
  assert.equal(sendsDerivedTotals("pf1", "Item", "npc"), false);
  assert.equal(sendsDerivedTotals("pf2e", "Actor", "npc"), false);
  assert.equal(sendsDerivedTotals("dnd5e", "Actor", "npc"), false);
});
