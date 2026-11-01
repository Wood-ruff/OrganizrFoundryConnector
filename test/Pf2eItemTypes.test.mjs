import { test } from "node:test";
import assert from "node:assert/strict";
import { IDENTITY_KINDS, PHYSICAL_TYPES, isCoinItem } from "../scripts/service/Pf2eItemTypes.mjs";

test("the identity kinds are listed once, in build order, and cannot be changed", () => {
  assert.deepEqual([...IDENTITY_KINDS], ["ancestry", "heritage", "background", "class", "deity"]);
  assert.equal(Object.isFrozen(IDENTITY_KINDS), true);
});

test("books count as physical items next to gear, and kits or feats do not", () => {
  assert.equal(PHYSICAL_TYPES.includes("book"), true);
  assert.equal(PHYSICAL_TYPES.includes("backpack"), true);
  assert.equal(PHYSICAL_TYPES.includes("kit"), false);
  assert.equal(PHYSICAL_TYPES.includes("feat"), false);
  assert.equal(Object.isFrozen(PHYSICAL_TYPES), true);
});

test("a coin item is a treasure of the coin category, whoever made it", () => {
  assert.equal(isCoinItem({ type: "treasure", system: { category: "coin", quantity: 3 } }), true);
  assert.equal(isCoinItem({ type: "treasure", system: { category: "gem" } }), false);
  assert.equal(isCoinItem({ type: "equipment", system: { category: "coin" } }), false);
  assert.equal(isCoinItem({ type: "treasure" }), false);
  assert.equal(isCoinItem(null), false);
});
