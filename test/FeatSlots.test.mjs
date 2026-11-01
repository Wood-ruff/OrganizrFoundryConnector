import { test } from "node:test";
import assert from "node:assert/strict";
import { featOrder, freeFeatSlots, slotFor, slotGroupsFor } from "../scripts/service/FeatSlots.mjs";

function free(group, level) {
  return { group, slotId: `${group}-${level}`, level };
}

test("a feature takes the free slot of its own level", () => {
  const slots = [free("class", 1), free("class", 2), free("class", 4)];
  assert.deepEqual(slotFor({ category: "class", level: 2 }, slots), free("class", 2));
});

test("without its level a feature takes the lowest higher slot", () => {
  const slots = [free("class", 1), free("class", 6), free("class", 4)];
  assert.deepEqual(slotFor({ category: "class", level: 2 }, slots), free("class", 4));
});

test("a skill feat falls back to a general slot", () => {
  const slots = [free("skill", 2), free("general", 3)];
  assert.deepEqual(slotFor({ category: "skill", level: 3 }, slots), free("general", 3));
  assert.deepEqual(slotFor({ category: "skill", level: 2 }, slots), free("skill", 2));
});

test("no fitting slot gives null", () => {
  assert.equal(slotFor({ category: "ancestry", level: 5 }, [free("ancestry", 1), free("class", 6)]), null);
  assert.equal(slotFor({ category: "classfeature", level: 1 }, [free("class", 1)]), null);
  assert.equal(slotFor({ category: "general", level: 1 }, []), null);
});

test("slot groups follow the feature category", () => {
  assert.deepEqual(slotGroupsFor("ancestry"), ["ancestry"]);
  assert.deepEqual(slotGroupsFor("class"), ["class"]);
  assert.deepEqual(slotGroupsFor("general"), ["general"]);
  assert.deepEqual(slotGroupsFor("skill"), ["skill", "general"]);
  assert.deepEqual(slotGroupsFor("bonus"), []);
});

test("features are built ancestry, class, general, skill, then the rest; each by level, then recipe order", () => {
  const features = [
    { name: "Bonus Knack", category: "bonus", level: 1 },
    { name: "Keen Recall", category: "skill", level: 2 },
    { name: "Toughness", category: "general", level: 3 },
    { name: "Steadfast Guard", category: "class", level: 4 },
    { name: "Swift Lunge", category: "class", level: 1 },
    { name: "Lowlight Eyes", category: "ancestry", level: 1 },
    { name: "Granted Trick", category: "classfeature", level: 1 },
    { name: "Second Step", category: "class", level: 1 }
  ];
  assert.deepEqual(featOrder(features).map((feature) => feature.name), [
    "Lowlight Eyes", "Swift Lunge", "Second Step", "Steadfast Guard", "Toughness", "Keen Recall", "Bonus Knack",
    "Granted Trick"
  ]);
  assert.deepEqual(featOrder(null), []);
});

test("free slots come from pf2e's feat groups, empty and not above the actor level", () => {
  const groups = [
    { id: "classfeature", slots: {} },
    { id: "ancestry", slots: { "ancestry-1": { id: "ancestry-1", level: 1, feat: { name: "Taken" } },
      "ancestry-5": { id: "ancestry-5", level: 5, feat: null } } },
    { id: "skill", slots: { backgroundItemId: { id: "backgroundItemId", level: null, feat: null },
      "skill-2": { id: "skill-2", feat: null }, "skill-6": { id: "skill-6", level: 6 } } }
  ];
  assert.deepEqual(freeFeatSlots(groups, 5), [
    { group: "ancestry", slotId: "ancestry-5", level: 5 },
    { group: "skill", slotId: "skill-2", level: 2 }
  ]);
  assert.deepEqual(freeFeatSlots(null, 5), []);
});
