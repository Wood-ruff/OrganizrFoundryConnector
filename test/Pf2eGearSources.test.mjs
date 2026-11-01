import { test } from "node:test";
import assert from "node:assert/strict";
import { carryState, coinEntries, gearPlan, placedGearSource } from "../scripts/service/Pf2eGearSources.mjs";

function gear(type, usage, extra = {}) {
  return { name: `Test ${type}`, type, system: { usage: { value: usage }, quantity: 1,
    equipped: { carryType: "worn", handsHeld: 0, invested: null }, ...extra } };
}

function entry(values) {
  return { quantity: 1, equipped: false, invested: false, container: null, ...values };
}

test("an equipped weapon or shield is held in one hand, a two-handed one in two", () => {
  assert.deepEqual(carryState(entry({ equipped: true }), gear("weapon", "held-in-one-hand")).equipped,
    { carryType: "held", handsHeld: 1, invested: null });
  assert.deepEqual(carryState(entry({ equipped: true }), gear("weapon", "held-in-two-hands")).equipped,
    { carryType: "held", handsHeld: 2, invested: null });
  assert.deepEqual(carryState(entry({ equipped: true }), gear("shield", "")).equipped,
    { carryType: "held", handsHeld: 1, invested: null });
  assert.deepEqual(carryState(entry({ equipped: true }), gear("equipment", "held-in-one-hand")).equipped.carryType, "held");
});

test("equipped worn gear sits in its slot and invested gear is invested", () => {
  const state = carryState(entry({ equipped: true, invested: true }), gear("armor", "wornarmor"));
  assert.deepEqual(state.equipped, { carryType: "worn", handsHeld: 0, invested: true, inSlot: true });
});

test("gear that is not equipped is worn outside its slot, held usage included", () => {
  const expected = { carryType: "worn", handsHeld: 0, invested: null, inSlot: false };
  assert.deepEqual(carryState(entry({}), gear("weapon", "held-in-two-hands")).equipped, expected);
  assert.deepEqual(carryState(entry({}), gear("equipment", "wornneck")).equipped, expected);
});

test("gear in a container is stowed there and keeps its quantity", () => {
  const state = carryState(entry({ equipped: true, quantity: 3 }), gear("consumable", "held-in-one-hand"), "bag001");
  assert.equal(state.containerId, "bag001");
  assert.equal(state.quantity, 3);
  assert.equal(state.equipped.carryType, "stowed");
  assert.equal(carryState(entry({ quantity: null }), gear("treasure", "")).quantity, 1);
  assert.equal(carryState(entry({}), gear("treasure", "")).containerId, null);
});

test("a placed gear source carries the carry fields without touching the original", () => {
  const source = gear("weapon", "held-in-one-hand");
  const placed = placedGearSource(source, entry({ equipped: true, quantity: 2 }), null);
  assert.equal(placed.system.quantity, 2);
  assert.equal(placed.system.equipped.carryType, "held");
  assert.equal(placed.system.containerId, null);
  assert.equal(placed.system.usage.value, "held-in-one-hand");
  assert.equal(source.system.equipped.carryType, "worn");
});

test("entries go into backpacks; under any other item they are loose and reported as attached", () => {
  const inventory = [
    entry({ key: "i:1", name: "Travel Pack" }),
    entry({ key: "i:2", name: "Rope Coil", container: "i:1" }),
    entry({ key: "i:3", name: "Notched Blade" }),
    entry({ key: "i:4", name: "Blade Charm", container: "i:3" }),
    entry({ key: "i:5", name: "Lost Thing" }),
    entry({ key: "i:6", name: "Orphan Pebble", container: "i:5" }),
    entry({ key: "i:7", name: "Empty Satchel" })
  ];
  const sources = new Map([
    ["i:1", gear("backpack", "worn")], ["i:2", gear("equipment", "")], ["i:3", gear("weapon", "held-in-one-hand")],
    ["i:4", gear("equipment", "")], ["i:6", gear("treasure", "")], ["i:7", gear("backpack", "worn")]
  ]);
  assert.deepEqual(gearPlan(inventory, sources), {
    containers: ["i:1"],
    items: ["i:2", "i:3", "i:4", "i:6", "i:7"],
    attached: ["i:4"],
    parents: { "i:2": "i:1" }
  });
});

test("nested backpacks come outer first and a container loop is broken", () => {
  const inventory = [
    entry({ key: "i:inner", container: "i:outer" }),
    entry({ key: "i:outer" }),
    entry({ key: "i:coin", container: "i:inner" }),
    entry({ key: "i:a", container: "i:b" }),
    entry({ key: "i:b", container: "i:a" })
  ];
  const sources = { "i:inner": gear("backpack", ""), "i:outer": gear("backpack", ""), "i:coin": gear("treasure", ""),
    "i:a": gear("backpack", ""), "i:b": gear("backpack", "") };
  const plan = gearPlan(inventory, sources);
  assert.deepEqual(plan.containers, ["i:outer", "i:b", "i:inner"]);
  assert.deepEqual(plan.parents, { "i:inner": "i:outer", "i:coin": "i:inner", "i:a": "i:b" });
  assert.deepEqual(gearPlan(null, null), { containers: [], items: [], attached: [], parents: {} });
});

test("coins become one item per currency and electrum is kept for the report", () => {
  assert.deepEqual(coinEntries({ pp: 0, gp: 15, sp: 3, cp: 7, ep: 4 }), {
    entries: [
      { key: "c:gp", slug: "gold-pieces", quantity: 15 },
      { key: "c:sp", slug: "silver-pieces", quantity: 3 },
      { key: "c:cp", slug: "copper-pieces", quantity: 7 }
    ],
    electrum: 4
  });
  assert.deepEqual(coinEntries({ pp: 2 }).entries, [{ key: "c:pp", slug: "platinum-pieces", quantity: 2 }]);
  assert.deepEqual(coinEntries(null), { entries: [], electrum: 0 });
});
