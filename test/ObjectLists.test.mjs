import { test } from "node:test";
import assert from "node:assert/strict";
import { isPlainObject, listOf, mergedById } from "../scripts/util/ObjectLists.mjs";

test("only non-null, non-array objects are plain objects", () => {
  assert.equal(isPlainObject({ name: "Lantern" }), true);
  assert.equal(isPlainObject(null), false);
  assert.equal(isPlainObject([]), false);
  assert.equal(isPlainObject("Lantern"), false);
  assert.equal(isPlainObject(3), false);
});

test("a list keeps its object entries in order and drops everything else", () => {
  const first = { name: "Rope" };
  const second = { name: "Chalk" };
  assert.deepEqual(listOf([first, null, "Torch", 4, ["nested"], second, undefined]), [first, second]);
});

test("anything that is not an array is an empty list", () => {
  assert.deepEqual(listOf(undefined), []);
  assert.deepEqual(listOf(null), []);
  assert.deepEqual(listOf({ 0: { name: "Rope" } }), []);
  assert.deepEqual(listOf("Rope"), []);
});

test("updates of the same item merge into one, in first-seen order, the later field winning", () => {
  const merged = mergedById([
    { _id: "rope", "system.quantity": 2 },
    { _id: "chalk", "system.quantity": 1 },
    { _id: "rope", "system.containerId": "sack", "system.quantity": 3 },
    null
  ]);
  assert.deepEqual(merged, [
    { _id: "rope", "system.quantity": 3, "system.containerId": "sack" },
    { _id: "chalk", "system.quantity": 1 }
  ]);
  assert.deepEqual(mergedById(undefined), []);
});
