import { test } from "node:test";
import assert from "node:assert/strict";
import { totalsActor } from "../scripts/service/Pf2eTotalsActor.mjs";
import { derivedTotalsFor } from "../scripts/service/DerivedTotals.mjs";

function itemSource(id, type) {
  return { _id: id, name: `Invented ${type} ${id}`, type };
}

/** A fake prepared actor whose clone records the call and reads its numbers from the kept items. */
function fakeActor(sources, numbers = (items) => ({ ac: 20 + items.length })) {
  const calls = [];
  const actor = {
    documentName: "Actor", type: "character", id: "fxActor0000000001",
    items: { contents: sources.map((source) => ({ id: source._id, type: source.type })) },
    toObject: () => ({ name: "Invented Hero", items: structuredClone(sources) }),
    clone(data, context) {
      calls.push({ data, context });
      return { ...actor, items: { contents: data.items }, armorClass: { value: numbers(data.items).ac } };
    },
    armorClass: { value: numbers(sources).ac }
  };
  return { actor, calls };
}

test("an actor without conditions, effects or afflictions is read as it is, without a copy", () => {
  const { actor, calls } = fakeActor([itemSource("a1", "feat"), itemSource("a2", "weapon")]);
  assert.equal(totalsActor(actor), actor);
  assert.equal(calls.length, 0);
});

test("an actor in play is read from an in-memory copy without its conditions, effects and afflictions, ids kept", () => {
  const sources = [
    itemSource("f1", "feat"), itemSource("c1", "condition"), itemSource("e1", "effect"),
    itemSource("w1", "weapon"), itemSource("p1", "affliction")
  ];
  const { actor, calls } = fakeActor(sources);

  const copy = totalsActor(actor);

  assert.notEqual(copy, actor);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].data.items.map((item) => item._id), ["f1", "w1"]);
  assert.deepEqual(calls[0].context, { keepId: true });
  assert.equal(actor.items.contents.length, 5);
});

test("an actor without an item collection is read as it is", () => {
  const actor = { documentName: "Actor", type: "character" };
  assert.equal(totalsActor(actor), actor);
  assert.equal(totalsActor(null), null);
});

test("a pf2e character's totals ignore its conditions and effects; one without any is not copied", () => {
  const prepared = {
    level: 2, hitPoints: { max: 30 }, perception: { mod: 6 },
    saves: { fortitude: { mod: 7 }, reflex: { mod: 5 }, will: { mod: 4 } }, system: {}
  };
  const inPlay = fakeActor([itemSource("f1", "feat"), itemSource("c1", "condition")], (items) => ({ ac: 17 - (items.length - 1) * 2 }));
  Object.assign(inPlay.actor, prepared);

  assert.equal(inPlay.actor.armorClass.value, 15);
  assert.equal(derivedTotalsFor("pf2e", inPlay.actor).ac, 17);

  const calm = fakeActor([itemSource("f1", "feat")], () => ({ ac: 17 }));
  Object.assign(calm.actor, prepared);
  assert.equal(derivedTotalsFor("pf2e", calm.actor).ac, 17);
  assert.equal(calm.calls.length, 0);
});
