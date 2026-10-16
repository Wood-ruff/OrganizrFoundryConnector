import { test } from "node:test";
import assert from "node:assert/strict";
import { combatantSnapshot, jsonSafe, snapshotJson } from "../scripts/service/CombatantSnapshot.mjs";

function fakeDocument(source) {
  return { toObject: () => structuredClone(source), ...source };
}

test("snapshot contains combatant, token, actor source and derived system data", () => {
  const actor = fakeDocument({ _id: "a1", name: "Goblin", system: { attributes: { hp: { value: 5, max: 9 } } } });
  actor.system = { attributes: { hp: { value: 5, max: 9 } }, derivedAc: 15, compute: () => 1 };
  const token = fakeDocument({ _id: "t1", name: "Goblin Token" });
  const combatant = fakeDocument({ _id: "c1", initiative: 12 });
  combatant.actor = actor;
  combatant.token = token;

  const snapshot = combatantSnapshot(combatant);

  assert.equal(snapshot.combatant._id, "c1");
  assert.equal(snapshot.token._id, "t1");
  assert.equal(snapshot.actor.system.attributes.hp.value, 5);
  assert.equal(snapshot.actorDerived.derivedAc, 15);
  assert.equal("compute" in snapshot.actorDerived, false);
  assert.match(snapshot.capturedAt, /^\d{4}-\d{2}-\d{2}T/);
});

test("a combatant without token or actor yields nulls", () => {
  const snapshot = combatantSnapshot(fakeDocument({ _id: "c1" }));
  assert.equal(snapshot.token, null);
  assert.equal(snapshot.actor, null);
  assert.equal(snapshot.actorDerived, null);
});

test("jsonSafe cuts reference cycles and drops functions", () => {
  const node = { name: "root", fn: () => 1 };
  node.self = node;
  assert.deepEqual(jsonSafe(node), { name: "root", self: "[circular]" });
  assert.equal(jsonSafe(undefined), null);
});

test("snapshotJson is two-space indented JSON", () => {
  assert.equal(snapshotJson({ a: 1 }), '{\n  "a": 1\n}');
});
