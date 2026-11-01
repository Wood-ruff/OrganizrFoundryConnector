import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ackBody, actorCommandState, commandOperation, exhaustionLevelOf, exhaustionOperation, isDnd5eExhaustionCommand
} from "../scripts/service/CombatCommands.mjs";

const state = actorCommandState({
  conditions: [{ slug: "frightened", name: "Frightened", value: 2 }, { slug: "prone", name: "Prone", value: null }],
  effects: [{ kind: "effect", id: "e1", name: "Effect: Bless", slug: "effect-bless" }, { kind: "activeEffect", id: "a1", name: "Blinded" }],
  statuses: ["frightened", "prone", "blinded"]
});

test("actorCommandState tolerates a missing actor", () => {
  assert.deepEqual(actorCommandState(null), { conditions: [], effects: [], statuses: [] });
});

test("setCondition adds or changes a condition and skips when already set", () => {
  assert.deepEqual(commandOperation({ type: "setCondition", slug: "frightened", value: 1 }, state), { op: "setCondition", slug: "frightened", value: 1 });
  assert.deepEqual(commandOperation({ type: "setCondition", slug: "wounded", value: 1 }, state), { op: "setCondition", slug: "wounded", value: 1 });
  assert.deepEqual(commandOperation({ type: "setCondition", slug: "frightened", value: 2 }, state), { op: "skip", reason: "already-set" });
  assert.deepEqual(commandOperation({ type: "setCondition", slug: "prone" }, state), { op: "skip", reason: "already-set" });
  assert.deepEqual(commandOperation({ type: "setCondition", value: 1 }, state), { op: "skip", reason: "missing-slug" });
});

test("removeCondition only acts on a present condition or status", () => {
  assert.deepEqual(commandOperation({ type: "removeCondition", slug: "prone" }, state), { op: "removeCondition", slug: "prone" });
  assert.deepEqual(commandOperation({ type: "removeCondition", slug: "blinded" }, state), { op: "removeCondition", slug: "blinded" });
  assert.deepEqual(commandOperation({ type: "removeCondition", slug: "stunned" }, state), { op: "skip", reason: "not-present" });
});

test("removeEffect finds the effect by id or slug", () => {
  assert.deepEqual(commandOperation({ type: "removeEffect", effectId: "a1" }, state), { op: "removeEffect", kind: "activeEffect", id: "a1" });
  assert.deepEqual(commandOperation({ type: "removeEffect", slug: "effect-bless" }, state), { op: "removeEffect", kind: "effect", id: "e1" });
  assert.deepEqual(commandOperation({ type: "removeEffect", slug: "effect-haste" }, state), { op: "skip", reason: "not-present" });
});

test("setStatus toggles a core status only when it differs", () => {
  assert.deepEqual(commandOperation({ type: "setStatus", slug: "dead", active: true }, state), { op: "setStatus", slug: "dead", active: true });
  assert.deepEqual(commandOperation({ type: "setStatus", slug: "blinded", active: true }, state), { op: "skip", reason: "already-set" });
  assert.deepEqual(commandOperation({ type: "setStatus", slug: "blinded", active: false }, state), { op: "setStatus", slug: "blinded", active: false });
});

test("unknown command types are skipped and ackBody normalizes results", () => {
  assert.deepEqual(commandOperation({ type: "explode" }, state), { op: "skip", reason: "unknown-type" });
  assert.deepEqual(ackBody([{ id: 1, ok: true }, { id: 2, ok: false, error: "no combatant" }]), {
    results: [{ id: 1, ok: true, error: null }, { id: 2, ok: false, error: "no combatant" }]
  });
});

test("only exhaustion set, remove and status commands in dnd5e change exhaustion in level steps", () => {
  assert.equal(isDnd5eExhaustionCommand({ type: "setCondition", slug: "exhaustion", value: 2 }, "dnd5e"), true);
  assert.equal(isDnd5eExhaustionCommand({ type: "removeCondition", slug: "exhaustion" }, "dnd5e"), true);
  assert.equal(isDnd5eExhaustionCommand({ type: "setStatus", slug: "exhaustion", active: false }, "dnd5e"), true);
  assert.equal(isDnd5eExhaustionCommand({ type: "removeEffect", effectId: "dnd5eexhaustion0" }, "dnd5e"), false);
  assert.equal(isDnd5eExhaustionCommand({ type: "setCondition", slug: "poisoned" }, "dnd5e"), false);
  assert.equal(isDnd5eExhaustionCommand({ type: "setCondition", slug: "exhaustion", value: 2 }, "pf2e"), false);
  assert.equal(isDnd5eExhaustionCommand({ type: "setCondition", slug: "exhaustion", value: 2 }, "pf1"), false);
});

test("setting exhaustion steps by the difference to the current level", () => {
  assert.deepEqual(exhaustionOperation({ type: "setCondition", slug: "exhaustion", value: 3 }, 1), { op: "changeLevels", slug: "exhaustion", steps: [2] });
  assert.deepEqual(exhaustionOperation({ type: "setCondition", slug: "exhaustion", value: 1 }, 3), { op: "changeLevels", slug: "exhaustion", steps: [-2] });
  assert.deepEqual(exhaustionOperation({ type: "setCondition", slug: "exhaustion", value: 0 }, 3), { op: "changeLevels", slug: "exhaustion", steps: [-3] });
  assert.deepEqual(exhaustionOperation({ type: "setCondition", slug: "exhaustion", value: 9 }, 4), { op: "changeLevels", slug: "exhaustion", steps: [2] });
});

test("exhaustion that is absent starts at level 1 and then rises to the commanded level", () => {
  assert.deepEqual(exhaustionOperation({ type: "setCondition", slug: "exhaustion", value: 1 }, 0), { op: "changeLevels", slug: "exhaustion", steps: [1] });
  assert.deepEqual(exhaustionOperation({ type: "setCondition", slug: "exhaustion", value: 2 }, 0), { op: "changeLevels", slug: "exhaustion", steps: [1, 1] });
  assert.deepEqual(exhaustionOperation({ type: "setCondition", slug: "exhaustion", value: 6 }, 0), { op: "changeLevels", slug: "exhaustion", steps: [1, 5] });
});

test("setting exhaustion to the level it has is no call", () => {
  assert.deepEqual(exhaustionOperation({ type: "setCondition", slug: "exhaustion", value: 2 }, 2), { op: "skip", reason: "already-set" });
  assert.deepEqual(exhaustionOperation({ type: "setCondition", slug: "exhaustion", value: 0 }, 0), { op: "skip", reason: "already-set" });
  assert.deepEqual(exhaustionOperation({ type: "setCondition", slug: "exhaustion" }, 2), { op: "skip", reason: "already-set" });
});

test("exhaustion without a level is level 1 when absent", () => {
  assert.deepEqual(exhaustionOperation({ type: "setCondition", slug: "exhaustion" }, 0), { op: "changeLevels", slug: "exhaustion", steps: [1] });
  assert.deepEqual(exhaustionOperation({ type: "setStatus", slug: "exhaustion", active: true }, 0), { op: "changeLevels", slug: "exhaustion", steps: [1] });
  assert.deepEqual(exhaustionOperation({ type: "setStatus", slug: "exhaustion", active: true }, 3), { op: "skip", reason: "already-set" });
});

test("removing exhaustion steps down by the whole current level and skips when there is none", () => {
  assert.deepEqual(exhaustionOperation({ type: "removeCondition", slug: "exhaustion" }, 3), { op: "changeLevels", slug: "exhaustion", steps: [-3] });
  assert.deepEqual(exhaustionOperation({ type: "setStatus", slug: "exhaustion", active: false }, 2), { op: "changeLevels", slug: "exhaustion", steps: [-2] });
  assert.deepEqual(exhaustionOperation({ type: "removeCondition", slug: "exhaustion" }, 0), { op: "skip", reason: "not-present" });
  assert.deepEqual(exhaustionOperation({ type: "setStatus", slug: "exhaustion", active: false }, 0), { op: "skip", reason: "already-set" });
});

test("the current exhaustion level is the prepared whole level within 0-6", () => {
  assert.equal(exhaustionLevelOf({ system: { attributes: { exhaustion: 2 } } }), 2);
  assert.equal(exhaustionLevelOf({ system: { attributes: { exhaustion: 8 } } }), 6);
  assert.equal(exhaustionLevelOf({ system: { attributes: { exhaustion: Number.NaN } } }), 0);
  assert.equal(exhaustionLevelOf({ system: { attributes: {} } }), 0);
  assert.equal(exhaustionLevelOf(null), 0);
});

test("other dnd5e statuses keep the plain status commands", () => {
  const dnd5eState = actorCommandState({ statuses: ["poisoned"] });
  assert.deepEqual(commandOperation({ type: "setStatus", slug: "prone", active: true }, dnd5eState), { op: "setStatus", slug: "prone", active: true });
  assert.deepEqual(commandOperation({ type: "removeCondition", slug: "poisoned" }, dnd5eState), { op: "removeCondition", slug: "poisoned" });
});
