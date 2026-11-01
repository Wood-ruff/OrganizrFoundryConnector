import { test } from "node:test";
import assert from "node:assert/strict";
import { PENDING_REBUILD_FLAG, pendingSnapshot, recordedSnapshot } from "../scripts/service/PlayStateRecord.mjs";

const MODULE = "organizr-foundry-connector";

function snapshot() {
  return {
    built: true,
    actor: { hp: 12, temp: 2, heroPoints: 1, focus: 0 },
    roots: new Map([["i:5", { id: "rope000000000001", quantity: 2, uses: 1, hp: 3, containerId: "sack000000000001" }]]),
    byName: [],
    spellUses: new Map([["key:e:innate/s:n:glow.mote", 1]]),
    entries: new Map([["key:e:book", { slot1: { value: 1, expended: new Map([["key:e:book/s:30", 2]]) } }]]),
    choices: new Map([["Compendium.pf2e.feats-srd.Item.quickhands000001", new Set(["left", { slug: "odd" }])]]),
    containers: [{ id: "pebble0000000001", containerId: "rope000000000001" }],
    gearKeys: ["i:5"]
  };
}

function actorHolding(record) {
  return { flags: { [MODULE]: { [PENDING_REBUILD_FLAG]: record } } };
}

test("a recorded snapshot holds only plain lists, so no key with a dot or a uuid is read as a path", () => {
  const record = recordedSnapshot(snapshot());
  assert.deepEqual(JSON.parse(JSON.stringify(record)), record);
  assert.deepEqual(record.spellUses, [["key:e:innate/s:n:glow.mote", 1]]);
  assert.deepEqual(record.entries, [["key:e:book", [["slot1", { value: 1, expended: [["key:e:book/s:30", 2]] }]]]]);
  assert.deepEqual(record.choices, [["Compendium.pf2e.feats-srd.Item.quickhands000001", ["left", { slug: "odd" }]]]);
});

test("the snapshot read back from the actor equals the one recorded", () => {
  const read = pendingSnapshot(actorHolding(JSON.parse(JSON.stringify(recordedSnapshot(snapshot())))));
  assert.deepEqual(read, snapshot());
});

test("no record, another version or an odd record gives no pending snapshot; odd parts are dropped", () => {
  assert.equal(pendingSnapshot({ flags: {} }), null);
  assert.equal(pendingSnapshot(null), null);
  assert.equal(pendingSnapshot(actorHolding({ version: 2 })), null);
  assert.equal(pendingSnapshot(actorHolding([])), null);
  const read = pendingSnapshot(actorHolding({ version: 1, roots: [["i:5", { id: "x" }], ["broken"], 7], gearKeys: ["i:5", 3] }));
  assert.deepEqual([...read.roots.keys()], ["i:5"]);
  assert.deepEqual(read.gearKeys, ["i:5"]);
  assert.equal(read.built, false);
  assert.deepEqual(read.actor, {});
  assert.equal(read.choices.size, 0);
});
