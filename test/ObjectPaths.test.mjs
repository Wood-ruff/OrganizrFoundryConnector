import { test } from "node:test";
import assert from "node:assert/strict";
import { copyPathFrom, setAt, valueAt } from "../scripts/util/ObjectPaths.mjs";

test("valueAt reads nested values and gives undefined for a missing step", () => {
  const source = { attributes: { hp: { temp: 0 } }, list: null };
  assert.equal(valueAt(source, "attributes.hp.temp"), 0);
  assert.deepEqual(valueAt(source, "attributes.hp"), { temp: 0 });
  assert.equal(valueAt(source, "attributes.death.success"), undefined);
  assert.equal(valueAt(source, "list.value"), undefined);
  assert.equal(valueAt(undefined, "a"), undefined);
});

test("setAt creates the objects on the way and writes a copy", () => {
  const target = { attributes: { hp: 5 } };
  const value = { spent: 1 };
  setAt(target, "attributes.hp.temp", 3);
  setAt(target, "resources.legact", value);
  value.spent = 9;
  assert.deepEqual(target, { attributes: { hp: { temp: 3 } }, resources: { legact: { spent: 1 } } });
});

test("copyPathFrom copies present values, falsy ones included, and skips missing ones", () => {
  const target = { inspiration: true, death: { success: 2 } };
  copyPathFrom(target, { inspiration: false, death: {} }, "inspiration");
  copyPathFrom(target, { death: {} }, "death.success");
  copyPathFrom(target, { favorites: null }, "favorites");
  assert.deepEqual(target, { inspiration: false, death: { success: 2 }, favorites: null });
});
