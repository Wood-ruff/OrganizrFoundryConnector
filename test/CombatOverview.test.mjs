import { test } from "node:test";
import assert from "node:assert/strict";
import { combatOverview } from "../scripts/service/CombatOverview.mjs";

const gm = { isGM: true };
const player = { isGM: false };

function combatant(overrides) {
  return {
    id: "c1", name: "Goblin", img: "icons/goblin.webp", initiative: 12,
    isDefeated: false, hidden: false, isNPC: true, visible: true, ...overrides
  };
}

test("no combat yields an empty, non-existing overview", () => {
  const result = combatOverview(null, gm);
  assert.deepEqual(result, { exists: false, started: false, round: 0, combatants: [] });
});

test("a started combat lists combatants in turn order with the current one marked", () => {
  const first = combatant({ id: "a", name: "Fighter", initiative: 18, isNPC: false });
  const second = combatant({ id: "b" });
  const combat = { started: true, round: 3, turns: [first, second], combatant: second };

  const result = combatOverview(combat, gm);

  assert.equal(result.exists, true);
  assert.equal(result.started, true);
  assert.equal(result.round, 3);
  assert.deepEqual(result.combatants.map((c) => c.id), ["a", "b"]);
  assert.equal(result.combatants[0].isCurrent, false);
  assert.equal(result.combatants[1].isCurrent, true);
  assert.equal(result.combatants[0].isNPC, false);
});

test("an unstarted combat has no current combatant", () => {
  const combat = { started: false, round: 0, turns: [combatant({})], combatant: null };
  const result = combatOverview(combat, gm);
  assert.equal(result.started, false);
  assert.equal(result.combatants[0].isCurrent, false);
});

test("missing initiative is reported as null", () => {
  const combat = { started: true, round: 1, turns: [combatant({ initiative: undefined })], combatant: null };
  assert.equal(combatOverview(combat, gm).combatants[0].initiative, null);
});

test("players do not see combatants Foundry marks invisible to them, GMs do", () => {
  const hidden = combatant({ id: "h", hidden: true, visible: false });
  const shown = combatant({ id: "s" });
  const combat = { started: true, round: 1, turns: [hidden, shown], combatant: null };

  assert.deepEqual(combatOverview(combat, player).combatants.map((c) => c.id), ["s"]);
  const forGm = combatOverview(combat, gm).combatants;
  assert.deepEqual(forGm.map((c) => c.id), ["h", "s"]);
  assert.equal(forGm[0].isHidden, true);
});

test("defeated combatants are flagged", () => {
  const combat = { started: true, round: 1, turns: [combatant({ isDefeated: true })], combatant: null };
  assert.equal(combatOverview(combat, gm).combatants[0].isDefeated, true);
});
