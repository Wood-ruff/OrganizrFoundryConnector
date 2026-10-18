import { test } from "node:test";
import assert from "node:assert/strict";
import { diffState, hasChanges, stateSnapshot } from "../scripts/service/StateDiff.mjs";

function entry(overrides = {}) {
  return {
    id: "C1", initiative: 17, defeated: false, hidden: false,
    actor: {
      hp: { value: 10, max: 15, temp: 0 },
      statuses: ["frightened"],
      conditions: [{ slug: "frightened", name: "Frightened", value: 1 }],
      effects: [{ kind: "effect", id: "e1", name: "Effect: Bless", img: "b.webp", slug: "effect-bless" }],
      ...overrides.actor
    },
    ...overrides.entry
  };
}

test("stateSnapshot keeps only the compared fields", () => {
  const snapshot = stateSnapshot(entry());
  assert.deepEqual(snapshot, {
    initiative: 17, defeated: false, hidden: false,
    hp: { value: 10, max: 15, temp: 0 },
    statuses: ["frightened"],
    conditions: [{ slug: "frightened", name: "Frightened", value: 1 }],
    effects: [{ kind: "effect", id: "e1", name: "Effect: Bless", slug: "effect-bless" }]
  });
});

test("stateSnapshot survives a combatant without actor", () => {
  const snapshot = stateSnapshot({ id: "C1", actor: null });
  assert.equal(snapshot.hp, null);
  assert.deepEqual(snapshot.conditions, []);
  assert.deepEqual(snapshot.effects, []);
});

test("diffState is null without a baseline and hasChanges then forces a push", () => {
  const changes = diffState(undefined, stateSnapshot(entry()));
  assert.equal(changes, null);
  assert.equal(hasChanges(changes), true);
});

test("identical snapshots produce an empty diff that needs no push", () => {
  const changes = diffState(stateSnapshot(entry()), stateSnapshot(entry()));
  assert.deepEqual(changes.conditions, { added: [], removed: [], changed: [] });
  assert.deepEqual(changes.statuses, { added: [], removed: [] });
  assert.deepEqual(changes.effects, { added: [], removed: [] });
  assert.equal(changes.hp, null);
  assert.equal(changes.defeated, null);
  assert.equal(hasChanges(changes), false);
});

test("conditions report added, removed and value changes with the previous value", () => {
  const before = stateSnapshot(entry({ actor: { conditions: [
    { slug: "frightened", name: "Frightened", value: 2 },
    { slug: "prone", name: "Prone", value: null }
  ] } }));
  const after = stateSnapshot(entry({ actor: { conditions: [
    { slug: "frightened", name: "Frightened", value: 1 },
    { slug: "wounded", name: "Wounded", value: 1 }
  ] } }));
  const changes = diffState(before, after);
  assert.deepEqual(changes.conditions.added, [{ slug: "wounded", name: "Wounded", value: 1 }]);
  assert.deepEqual(changes.conditions.removed, [{ slug: "prone", name: "Prone", value: null }]);
  assert.deepEqual(changes.conditions.changed, [{ slug: "frightened", name: "Frightened", value: 1, previousValue: 2 }]);
  assert.equal(hasChanges(changes), true);
});

test("statuses and effects report added and removed entries", () => {
  const before = stateSnapshot(entry());
  const after = stateSnapshot(entry({ actor: {
    statuses: ["prone"],
    effects: [{ kind: "activeEffect", id: "a1", name: "Blinded" }]
  } }));
  const changes = diffState(before, after);
  assert.deepEqual(changes.statuses, { added: ["prone"], removed: ["frightened"] });
  assert.deepEqual(changes.effects.added, [{ kind: "activeEffect", id: "a1", name: "Blinded", slug: null }]);
  assert.deepEqual(changes.effects.removed, [{ kind: "effect", id: "e1", name: "Effect: Bless", slug: "effect-bless" }]);
});

test("hp reports previous, value and delta; temp hp separately", () => {
  const before = stateSnapshot(entry());
  const after = stateSnapshot(entry({ actor: { hp: { value: 6, max: 15, temp: 3 } } }));
  const changes = diffState(before, after);
  assert.deepEqual(changes.hp, { previous: 10, value: 6, delta: -4 });
  assert.deepEqual(changes.tempHp, { previous: 0, value: 3 });
});

test("hp delta is null when a side has no number", () => {
  const before = stateSnapshot(entry({ actor: { hp: null } }));
  const after = stateSnapshot(entry());
  assert.deepEqual(diffState(before, after).hp, { previous: null, value: 10, delta: null });
});

test("defeated, hidden and initiative changes are reported as scalars", () => {
  const before = stateSnapshot(entry());
  const after = stateSnapshot(entry({ entry: { defeated: true, hidden: true, initiative: 3 } }));
  const changes = diffState(before, after);
  assert.deepEqual(changes.defeated, { previous: false, value: true });
  assert.deepEqual(changes.hidden, { previous: false, value: true });
  assert.deepEqual(changes.initiative, { previous: 17, value: 3 });
});

