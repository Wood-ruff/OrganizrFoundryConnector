import { test } from "node:test";
import assert from "node:assert/strict";
import { withLocalizedResistanceLabels } from "../scripts/service/RuleLabels.mjs";

const KEY = "PF2E.SpecificRule.Equipment.ChannelProtectionAmuletLabel";
const texts = { [KEY]: "Channel Protection" };
const localize = (key) => texts[key] ?? key;

function dataWith(...rules) {
  return { name: "Mara", items: [{ _id: "i1", name: "Channel Protection Amulet", system: { rules, level: 3 } }] };
}

function rulesOf(data) {
  return data.items[0].system.rules;
}

test("a custom resistance label key is localized", () => {
  const rule = { key: "Resistance", type: "custom", value: 5, label: KEY };
  const result = withLocalizedResistanceLabels(dataWith(rule), localize);
  assert.deepEqual(rulesOf(result), [{ key: "Resistance", type: "custom", value: 5, label: "Channel Protection" }]);
  assert.equal(result.items[0].system.level, 3);
  assert.equal(result.name, "Mara");
});

test("type array with custom is localized; fire resistance is not", () => {
  const custom = { key: "Resistance", type: ["fire", "custom"], value: 5, label: KEY };
  const fire = { key: "Resistance", type: "fire", value: 5, label: KEY };
  const result = withLocalizedResistanceLabels(dataWith(custom, fire), localize);
  assert.equal(rulesOf(result)[0].label, "Channel Protection");
  assert.equal(rulesOf(result)[1].label, KEY);
});

test("missing key, blank text or a text with braces keeps the key", () => {
  const rule = { key: "Resistance", type: "custom", value: 5, label: KEY };
  for (const text of [KEY, "", "   ", "Protection {name}", undefined]) {
    const result = withLocalizedResistanceLabels(dataWith(rule), () => text);
    assert.equal(rulesOf(result)[0].label, KEY);
  }
});

test("plain labels and other rule keys stay untouched", () => {
  const rules = [
    { key: "Resistance", type: "custom", value: 5, label: "Holy Aura" },
    { key: "Resistance", type: "custom", value: 5 },
    { key: "Strike", label: KEY },
    { key: "FlatModifier", label: KEY, selector: "ac" }
  ];
  const result = withLocalizedResistanceLabels(dataWith(...rules), localize);
  assert.deepEqual(rulesOf(result), rules);
});

test("items without rules and the input object stay unchanged", () => {
  const data = {
    items: [{ name: "Plain" }, { name: "NoRules", system: {} }, ...dataWith({ key: "Resistance", type: "custom", value: 5, label: KEY }).items]
  };
  const before = structuredClone(data);
  const result = withLocalizedResistanceLabels(data, localize);
  assert.deepEqual(data, before);
  assert.deepEqual(result.items.slice(0, 2), before.items.slice(0, 2));
  assert.equal(result.items[2].system.rules[0].label, "Channel Protection");
});

test("data without an item list is returned as it is", () => {
  const data = { name: "Mara" };
  assert.equal(withLocalizedResistanceLabels(data, localize), data);
});
