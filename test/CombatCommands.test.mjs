import { test } from "node:test";
import assert from "node:assert/strict";
import { ackBody, actorCommandState, commandOperation } from "../scripts/service/CombatCommands.mjs";

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
