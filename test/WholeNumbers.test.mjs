import { test } from "node:test";
import assert from "node:assert/strict";
import { addWholeNumber, isFiniteNumber, wholeNumbers, wholeOrZero } from "../scripts/util/WholeNumbers.mjs";

test("only finite numbers count as numbers", () => {
  assert.equal(isFiniteNumber(3.5), true);
  assert.equal(isFiniteNumber(0), true);
  assert.equal(isFiniteNumber(Number.NaN), false);
  assert.equal(isFiniteNumber(Number.POSITIVE_INFINITY), false);
  assert.equal(isFiniteNumber("4"), false);
  assert.equal(isFiniteNumber(null), false);
});

test("values are rounded down under their keys", () => {
  assert.deepEqual(wholeNumbers({ ac: 15.9, hp: -2.5 }), { ac: 15, hp: -3 });
});

test("a whole number is added only for a finite value", () => {
  const target = {};
  addWholeNumber(target, "speed", 30.5);
  addWholeNumber(target, "level", undefined);
  addWholeNumber(target, "cr", "5");
  assert.deepEqual(target, { speed: 30 });
});

test("a missing or non-numeric value reads as 0", () => {
  assert.equal(wholeOrZero(7.8), 7);
  assert.equal(wholeOrZero(undefined), 0);
  assert.equal(wholeOrZero("12"), 0);
});
