import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyDnd5eEffects, isDnd5eData, keepDnd5eActorState, keepDnd5eContainerCurrency, keepDnd5eContentUses,
  keepDnd5eItemStates
} from "../scripts/service/Dnd5ePlayState.mjs";

const DND5E_STATS = { systemId: "dnd5e", systemVersion: "6.0.6" };
const ADJUSTMENTS_ID = "organizradj00001";
const EXHAUSTION_ID = "dnd5eexhaustion0";

function exhaustion(level) {
  return { _id: EXHAUSTION_ID, name: "Exhaustion", type: "condition", statuses: ["exhaustion"], system: { type: "exhaustion", level } };
}

function adjustments(value) {
  return { _id: ADJUSTMENTS_ID, name: "Organizr adjustments", type: "base", changes: [{ key: "system.bonuses.abilities.check", mode: 2, value }], disabled: false };
}

function npcCurrent() {
  return {
    _id: "npcCurrent000001",
    name: "Ashmaw Prowler",
    type: "npc",
    system: {
      attributes: {
        hp: { value: 12, max: 40, temp: 5, tempmax: -3 },
        death: { success: 1, failure: 2 },
        inspiration: true,
        hd: { spent: 2 },
        exhaustion: 1
      },
      resources: { legact: { max: 3, spent: 2 }, legres: { max: 2, spent: 1 }, lair: { value: true, initiative: 20, inside: true } },
      spells: { spell1: { value: 1 }, spell2: { value: 0 }, pact: { value: 1 } },
      currency: { gp: 3, sp: 9 },
      favorites: [{ type: "item", id: ".Item.foundryBite000001" }],
      bastion: { name: "Cinder Hold" }
    },
    items: [],
    effects: [],
    _stats: DND5E_STATS
  };
}

function npcIncoming() {
  return {
    name: "Ashmaw Prowler",
    type: "npc",
    system: {
      attributes: {
        hp: { value: 40, max: 40, temp: 0, tempmax: 0 },
        death: { success: 0, failure: 0 },
        inspiration: false,
        hd: { spent: 0 },
        exhaustion: 0
      },
      resources: { legact: { max: 3, spent: 0 }, legres: { max: 3, spent: 0 }, lair: { value: true, initiative: 15, inside: false } },
      spells: { spell1: { value: 4 }, spell2: { value: 3 }, spell3: { value: 2 } },
      currency: { gp: 50 }
    },
    items: [],
    effects: []
  };
}

test("only documents from a dnd5e world count as dnd5e data", () => {
  assert.equal(isDnd5eData({ _stats: DND5E_STATS }), true);
  assert.equal(isDnd5eData({ _stats: { systemId: "pf1" } }), false);
  assert.equal(isDnd5eData({}), false);
  assert.equal(isDnd5eData(null), false);
});

test("an NPC keeps temporary HP, death saves, inspiration and spent hit dice", () => {
  const result = npcIncoming();
  keepDnd5eActorState(result, npcCurrent());
  const attributes = result.system.attributes;
  assert.equal(attributes.hp.temp, 5);
  assert.equal(attributes.hp.tempmax, -3);
  assert.equal(attributes.hp.max, 40);
  assert.deepEqual(attributes.death, { success: 1, failure: 2 });
  assert.equal(attributes.inspiration, true);
  assert.equal(attributes.hd.spent, 2);
});

test("an NPC keeps spent legendary actions and resistances and whether it is in its lair, the maximums come from the export", () => {
  const result = npcIncoming();
  keepDnd5eActorState(result, npcCurrent());
  assert.deepEqual(result.system.resources.legact, { max: 3, spent: 2 });
  assert.deepEqual(result.system.resources.legres, { max: 3, spent: 1 });
  assert.deepEqual(result.system.resources.lair, { value: true, initiative: 15, inside: true });
});

test("every spell slot value and the whole currency come from the current actor", () => {
  const result = npcIncoming();
  keepDnd5eActorState(result, npcCurrent());
  assert.deepEqual(result.system.spells, { spell1: { value: 1 }, spell2: { value: 0 }, spell3: { value: 2 }, pact: { value: 1 } });
  assert.deepEqual(result.system.currency, { gp: 3, sp: 9 });
});

test("favorites and the bastion come from the current actor and are copies", () => {
  const current = npcCurrent();
  const result = npcIncoming();
  keepDnd5eActorState(result, current);
  assert.deepEqual(result.system.favorites, [{ type: "item", id: ".Item.foundryBite000001" }]);
  assert.deepEqual(result.system.bastion, { name: "Cinder Hold" });
  result.system.bastion.name = "changed";
  assert.equal(current.system.bastion.name, "Cinder Hold");
});

test("a character keeps its custom resources but not an attribute hit dice block", () => {
  const current = {
    ...npcCurrent(),
    type: "character",
    system: {
      attributes: { hd: { spent: 4 } },
      resources: {
        primary: { value: 1, max: 3, sr: false, lr: true, label: "Ember charges" },
        secondary: { value: 0, max: 0, sr: false, lr: false, label: "" },
        tertiary: { value: 2, max: 2, sr: true, lr: false, label: "Focus" }
      }
    }
  };
  const result = { type: "character", system: { attributes: {}, resources: { primary: { value: 3, max: 3, label: "" } } }, items: [] };
  keepDnd5eActorState(result, current);
  assert.deepEqual(result.system.resources.primary, current.system.resources.primary);
  assert.deepEqual(result.system.resources.tertiary, current.system.resources.tertiary);
  assert.equal(result.system.attributes.hd, undefined);
});

test("values the current actor does not hold stay as exported", () => {
  const result = npcIncoming();
  keepDnd5eActorState(result, { type: "npc", system: {}, items: [] });
  assert.deepEqual(result, npcIncoming());
});

function currentItems() {
  return [
    {
      _id: "foundryWeapon001",
      name: "Gloam Cleaver",
      type: "weapon",
      system: {
        equipped: false,
        attuned: true,
        uses: { spent: 1, max: "3" },
        activities: { organizratk00001: { _id: "organizratk00001", uses: { spent: 2, max: "2" } } }
      }
    },
    { _id: "foundrySpell0001", name: "Ember Lash", type: "spell", system: { prepared: 2, uses: { spent: 0 } } },
    { _id: "foundryClass0001", name: "Ironwarden", type: "class", system: { hd: { denomination: "d10", spent: 3 } } },
    { _id: "foundryPotion001", name: "Draught of Embers", type: "consumable", system: { quantity: 1, uses: { spent: 1 } } },
    { _id: "foundryArrows001", name: "Reed Arrows", type: "consumable", system: { quantity: 7, type: { value: "ammo" } } }
  ];
}

function incomingItems() {
  return [
    {
      _id: "organizrinv00001",
      name: "Gloam Cleaver",
      type: "weapon",
      system: {
        equipped: true,
        attuned: false,
        uses: { spent: 0, max: "3" },
        activities: {
          organizratk00001: { _id: "organizratk00001", uses: { spent: 0, max: "2" } },
          organizratk00002: { _id: "organizratk00002", uses: { spent: 0, max: "1" } }
        }
      }
    },
    { _id: "organizrspl00001", name: "Ember Lash", type: "spell", system: { prepared: 1, uses: { spent: 0 } } },
    { _id: "organizrcls00001", name: "Ironwarden", type: "class", system: { hd: { denomination: "d10", spent: 0 }, levels: 4 } },
    { _id: "organizrinv00002", name: "Draught of Embers", type: "consumable", system: { quantity: 3, uses: { spent: 0 } } },
    { _id: "organizrinv00003", name: "Reed Arrows", type: "consumable", system: { quantity: 20, type: { value: "ammo" } } }
  ];
}

test("items matched by type and name keep spent uses, equipped and attuned state", () => {
  const items = incomingItems();
  keepDnd5eItemStates(items, currentItems());
  const weapon = items[0].system;
  assert.equal(weapon.uses.spent, 1);
  assert.equal(weapon.uses.max, "3");
  assert.equal(weapon.equipped, false);
  assert.equal(weapon.attuned, true);
});

test("each activity keeps its spent uses by activity id; a new activity stays as exported", () => {
  const items = incomingItems();
  keepDnd5eItemStates(items, currentItems());
  const activities = items[0].system.activities;
  assert.deepEqual(activities.organizratk00001.uses, { spent: 2, max: "2" });
  assert.deepEqual(activities.organizratk00002.uses, { spent: 0, max: "1" });
});

test("a spell keeps its preparation, a class its spent hit dice, consumables and ammunition their quantity", () => {
  const items = incomingItems();
  keepDnd5eItemStates(items, currentItems());
  assert.equal(items[1].system.prepared, 2);
  assert.equal(items[2].system.hd.spent, 3);
  assert.equal(items[2].system.levels, 4);
  assert.equal(items[3].system.quantity, 1);
  assert.equal(items[3].system.uses.spent, 1);
  assert.equal(items[4].system.quantity, 7);
});

test("a weapon keeps no quantity and an item matched by id keeps its state", () => {
  const current = [{ _id: "organizrinv00001", name: "Gloam Cleaver", type: "weapon", system: { quantity: 9, equipped: false } }];
  const items = [incomingItems()[0], { _id: "x", name: "Gloam Cleaver", type: "weapon", system: { quantity: 1, equipped: true } }];
  items[0].system.quantity = 1;
  keepDnd5eItemStates(items, current);
  assert.equal(items[0].system.quantity, 1);
  assert.equal(items[0].system.equipped, false);
  assert.equal(items[1].system.equipped, true);
});

test("an item without a match or under another type keeps the exported state", () => {
  const items = [{ _id: "organizrinv00009", name: "Ember Lash", type: "feat", system: { uses: { spent: 0 } } }];
  keepDnd5eItemStates(items, currentItems());
  assert.equal(items[0].system.uses.spent, 0);
});

test("the actor state also keeps the state of its items", () => {
  const current = { ...npcCurrent(), items: currentItems() };
  const result = { ...npcIncoming(), items: incomingItems() };
  keepDnd5eActorState(result, current);
  assert.equal(result.items[0].system.uses.spent, 1);
});

test("effects: a current buff and a condition stay, the adjustments come from the export", () => {
  const current = {
    effects: [
      { _id: "foundryBuff00001", name: "Warding Hymn", type: "base", changes: [{ key: "system.attributes.ac.bonus", mode: 2, value: "1" }] },
      { _id: "dnd5epoisoned000", name: "Poisoned", type: "condition", statuses: ["poisoned"] },
      adjustments("+1")
    ]
  };
  const result = { system: {} };
  applyDnd5eEffects(result, current, { effects: [adjustments("+3")] }, true);
  assert.deepEqual(result.effects.map((effect) => effect._id), ["foundryBuff00001", "dnd5epoisoned000", ADJUSTMENTS_ID]);
  assert.equal(result.effects[2].changes[0].value, "+3");
});

test("effects: an adjustments effect the export no longer brings is removed", () => {
  const result = {};
  applyDnd5eEffects(result, { effects: [adjustments("+1")] }, { effects: [] }, true);
  assert.deepEqual(result.effects, []);
});

test("exhaustion: the current effect stays when keeping play state and the stored level matches it", () => {
  const result = { system: { attributes: { exhaustion: 0 } } };
  applyDnd5eEffects(result, { effects: [exhaustion(2)] }, { effects: [exhaustion(1)] }, true);
  assert.deepEqual(result.effects, [exhaustion(2)]);
  assert.equal(result.system.attributes.exhaustion, 2);
});

test("exhaustion: no current effect means none when keeping play state, even if the export has one", () => {
  const result = { system: { attributes: {} } };
  applyDnd5eEffects(result, { effects: [] }, { effects: [exhaustion(1)] }, true);
  assert.deepEqual(result.effects, []);
  assert.equal(result.system.attributes.exhaustion, 0);
});

test("exhaustion: without keeping play state the export's effect wins; stored level follows the current actor", () => {
  const result = { system: { attributes: { exhaustion: 0 } } };
  applyDnd5eEffects(result, { effects: [exhaustion(3)] }, { effects: [exhaustion(1)] }, false);
  assert.deepEqual(result.effects, [exhaustion(1)]);
  assert.equal(result.system.attributes.exhaustion, 3);

  const fresh = {};
  applyDnd5eEffects(fresh, { effects: [] }, { effects: [exhaustion(2), adjustments("+1")] }, false);
  assert.deepEqual(fresh.effects.map((effect) => effect._id), [ADJUSTMENTS_ID, EXHAUSTION_ID]);
  assert.equal(fresh.system.attributes.exhaustion, 0);
});

test("effects are copies and missing effect lists are tolerated", () => {
  const current = { effects: [exhaustion(1)] };
  const result = {};
  applyDnd5eEffects(result, current, null, true);
  result.effects[0].system.level = 5;
  assert.equal(current.effects[0].system.level, 1);

  const empty = {};
  applyDnd5eEffects(empty, {}, {}, true);
  assert.deepEqual(empty.effects, []);
});

test("a container keeps its current coins; other item types keep the exported ones", () => {
  const current = { type: "container", system: { currency: { gp: 2 } } };
  const result = { type: "container", system: { currency: { gp: 12, ep: 3 }, capacity: { count: 10 } } };
  keepDnd5eContainerCurrency(result, current);
  assert.deepEqual(result.system.currency, { gp: 2 });
  assert.deepEqual(result.system.capacity, { count: 10 });

  const loot = { type: "loot", system: { currency: { gp: 12 } } };
  keepDnd5eContainerCurrency(loot, { type: "loot", system: { currency: { gp: 2 } } });
  assert.equal(loot.system.currency.gp, 12);
});

test("container contents keep spent uses by name, but not their quantity", () => {
  const currentContents = [
    { _id: "foundryCandle001", name: "Tallow Candle Bundle", type: "consumable", system: { quantity: 2, uses: { spent: 1 }, activities: { organizruse00001: { uses: { spent: 1 } } } } }
  ];
  const contents = [
    { name: "Tallow Candle Bundle", type: "consumable", system: { quantity: 6, uses: { spent: 0 }, activities: { organizruse00001: { uses: { spent: 0 } } } } },
    { name: "Cracked Sunstone", type: "loot", system: { quantity: 1 } }
  ];
  keepDnd5eContentUses(contents, currentContents);
  assert.equal(contents[0].system.uses.spent, 1);
  assert.equal(contents[0].system.activities.organizruse00001.uses.spent, 1);
  assert.equal(contents[0].system.quantity, 6);
  assert.deepEqual(contents[1].system, { quantity: 1 });
});
