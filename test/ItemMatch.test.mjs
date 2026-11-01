import { test } from "node:test";
import assert from "node:assert/strict";
import { currentItemMatcher } from "../scripts/util/ItemMatch.mjs";

const current = [
  { _id: "aaaa", name: "Gloam Cleaver", type: "weapon" },
  { _id: "bbbb", name: "Ember Lash", type: "spell" },
  { _id: "cccc", name: "Reed Arrows", type: "consumable" },
  { _id: "dddd", name: "Reed Arrows", type: "consumable" }
];

test("the same id with the same type and name matches first", () => {
  const items = [{ _id: "aaaa", name: "Gloam Cleaver", type: "weapon" }];
  assert.equal(currentItemMatcher(items, current)(items[0]), current[0]);
});

test("an id naming another item falls back to a unique type and name", () => {
  const items = [{ _id: "aaaa", name: "Ember Lash", type: "spell" }];
  assert.equal(currentItemMatcher(items, current)(items[0]), current[1]);
});

test("a type and name shared on either side matches nothing", () => {
  const arrows = [{ name: "Reed Arrows", type: "consumable" }];
  assert.equal(currentItemMatcher(arrows, current)(arrows[0]), null);
  const twice = [{ name: "Ember Lash", type: "spell" }, { name: "Ember Lash", type: "spell" }];
  assert.equal(currentItemMatcher(twice, current)(twice[0]), null);
});

test("another type or no current items match nothing", () => {
  const items = [{ name: "Ember Lash", type: "feat" }];
  assert.equal(currentItemMatcher(items, current)(items[0]), null);
  assert.equal(currentItemMatcher(items, undefined)(items[0]), null);
});
