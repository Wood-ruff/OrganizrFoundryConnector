import { test } from "node:test";
import assert from "node:assert/strict";
import {
  actorStateUpdate, containerRestores, entrySlotUpdates, isBuiltActor, itemStateUpdates, keptRootId, rootIdsToDelete,
  snapshotPlayState, spellUseUpdates
} from "../scripts/service/BuiltPlayState.mjs";

const MODULE = "organizr-foundry-connector";
const SKILL_SOURCE = "Compendium.pf2e.feats-srd.Item.skillpick0000001";
const SCHOOL_SOURCE = "Compendium.pf2e.classfeatures.Item.schoolpick00001";

function keyed(key) {
  return { [MODULE]: { build: { key } } };
}

function item(_id, type, name, system = {}, extra = {}) {
  return { _id, type, name, system, flags: {}, ...extra };
}

function builtItem(_id, type, name, key, system = {}, extra = {}) {
  return item(_id, type, name, system, { ...extra, flags: { ...(extra.flags ?? {}), ...keyed(key) } });
}

function choiceRule(flag, selection, ignored = undefined) {
  const rule = { key: "ChoiceSet", flag, selection };
  if (ignored !== undefined) rule.ignored = ignored;
  return rule;
}

/** A built pf2e character as `actor.toObject()` gives it: build roots, their grants, play state and Foundry-only items. */
function builtActor() {
  return {
    name: "Wren Halloway",
    type: "character",
    flags: { [MODULE]: { build: { version: 1 }, sheet: { fileId: 41 } } },
    system: {
      attributes: { hp: { value: 40, temp: 5 } },
      resources: { heroPoints: { value: 2, max: 3 }, focus: { value: 0, max: 1 } }
    },
    items: [
      builtItem("ancestry00000001", "ancestry", "Tallfolk", "id:ancestry", { hp: 8 }),
      builtItem("background000001", "background", "Lamplighter", "id:background", {
        rules: [choiceRule("skill", "occultism")]
      }, { flags: { pf2e: { itemGrants: { assurance: { id: "assurance0000001", onDelete: "detach" } } } } }),
      builtItem("class00000000001", "class", "Spellwright", "id:class", { hp: 6 }),
      item("assurance0000001", "feat", "Assurance (Occultism)", {
        location: null, rules: [choiceRule("assurance", "occultism")]
      }, { flags: { pf2e: { grantedBy: { id: "background000001", onDelete: "cascade" } } }, _stats: { compendiumSource: SKILL_SOURCE } }),
      item("schoolfeature001", "feat", "Arcane Path", {
        location: "class00000000001", rules: [choiceRule("path", "Compendium.pf2e.classfeatures.Item.pathofember00001")]
      }, { flags: { pf2e: { itemGrants: { pathGrant: { id: "pathofember00001", onDelete: "restrict" } } } }, _stats: { compendiumSource: SCHOOL_SOURCE } }),
      item("pathofember00001", "feat", "Path of Embers", { location: null }),
      item("castaspell000001", "action", "Weave a Spell", {}, {
        flags: { pf2e: { grantedBy: { id: "schoolfeature001", onDelete: "cascade" } } }
      }),
      builtItem("featslotted00001", "feat", "Quick Hands", "f:12", {
        location: "class-2", rules: [choiceRule("hand", "left"), choiceRule("unset", null), choiceRule("off", "x", true)]
      }, { _stats: { compendiumSource: "Compendium.pf2e.feats-srd.Item.quickhands000001" } }),
      item("foundryonlyfeat1", "feat", "Table Favorite", { location: "general-3" }),
      item("frightened000001", "condition", "Frightened", { value: { value: 2 } }),
      item("wounded000000001", "condition", "Wounded", { value: { value: 1 } }),
      builtItem("backpack00000001", "backpack", "Patched Satchel", "i:60", { quantity: 1, hp: { value: 0, max: 0 } }),
      builtItem("potion0000000001", "consumable", "Mint Tonic", "i:61", {
        quantity: 2, uses: { value: 0, max: 1 }, hp: { value: 1, max: 1 }, containerId: "backpack00000001"
      }),
      builtItem("shield0000000001", "shield", "Oak Buckler", "i:62", { quantity: 1, hp: { value: 3, max: 6 } }),
      item("foundryonlyitem1", "equipment", "Lucky Pebble", { quantity: 1, containerId: "backpack00000001" }),
      builtItem("goldcoins0000001", "treasure", "Gold Pieces", "c:gp", { quantity: 9 }),
      builtItem("entryprepared001", "spellcastingEntry", "Arcane Prepared Spells", "e:arcane-prepared-spells", {
        slots: {
          slot0: { max: 5, value: 5, prepared: [] },
          slot1: { max: 3, value: 3, prepared: [
            { id: "spellember00001", expended: true }, { id: "spellember00001", expended: false },
            { id: "spellfrost00001", expended: true }
          ] }
        }
      }),
      builtItem("entryinnate00001", "spellcastingEntry", "Tallfolk Innate Spells", "e:tallfolk-innate-spells", {
        slots: { slot1: { max: 0, value: 0, prepared: [] } }
      }),
      builtItem("spellember00001", "spell", "Ember Lance", "e:arcane-prepared-spells/s:30", { location: { value: "entryprepared001" } }),
      builtItem("spellfrost00001", "spell", "Frost Thread", "e:arcane-prepared-spells/s:n:frost-thread", { location: { value: "entryprepared001" } }),
      builtItem("spellglow000001", "spell", "Glow Mote", "e:tallfolk-innate-spells/s:n:glow-mote", {
        location: { value: "entryinnate00001", uses: { value: 1, max: 3 } }
      })
    ]
  };
}

/** An actor pushed from Foundry or made by hand: no build flags anywhere. */
function pushedActor() {
  return {
    name: "Wren Halloway",
    type: "character",
    flags: { [MODULE]: { sheet: { fileId: 41 } } },
    system: { attributes: { hp: { value: 12, temp: 0 } }, resources: { heroPoints: { value: 1 }, focus: { value: 1 } } },
    items: [
      item("oldclass00000001", "class", "Spellwright", { hp: 6 }),
      item("oldtonic00000001", "consumable", "Mint Tonic", { quantity: 1, uses: { value: 0, max: 1 } }),
      item("oldarrows0000001", "ammo", "Reed Arrows", { quantity: 7 }),
      item("oldarrows0000002", "ammo", "Reed Arrows", { quantity: 3 }),
      item("oldgold000000001", "treasure", "Gold Pieces", { quantity: 4 }),
      item("oldentry00000001", "spellcastingEntry", "Arcane Prepared Spells", {
        slots: { slot1: { max: 2, value: 2, prepared: [{ id: "oldember00000001", expended: true }] } }
      }),
      item("oldember00000001", "spell", "Ember Lance", { location: { value: "oldentry00000001" } }),
      item("dying00000000001", "condition", "Dying", { value: { value: 1 } }),
      item("effect0000000001", "effect", "Blessed Ward", {})
    ]
  };
}

test("a snapshot keeps the actor's HP, temp HP, hero points and focus points", () => {
  const snapshot = snapshotPlayState(builtActor());
  assert.equal(snapshot.built, true);
  assert.deepEqual(snapshot.actor, { hp: 40, temp: 5, heroPoints: 2, focus: 0 });
});

test("a snapshot keeps each root's id and the quantity, uses and HP of physical items only", () => {
  const snapshot = snapshotPlayState(builtActor());
  assert.deepEqual(snapshot.roots.get("i:61"), { id: "potion0000000001", quantity: 2, uses: 0, hp: 1 });
  assert.deepEqual(snapshot.roots.get("i:62"), { id: "shield0000000001", quantity: 1, uses: undefined, hp: 3 });
  assert.deepEqual(snapshot.roots.get("c:gp"), { id: "goldcoins0000001", quantity: 9, uses: undefined, hp: undefined });
  assert.deepEqual(snapshot.roots.get("id:class"), { id: "class00000000001" });
  assert.deepEqual(snapshot.roots.get("id:ancestry"), { id: "ancestry00000001" });
  assert.equal(keptRootId(snapshot, "f:12"), "featslotted00001");
  assert.equal(keptRootId(snapshot, "f:99"), null);
});

test("a snapshot keeps innate uses and each slot's value with its expended preparations per spell", () => {
  const snapshot = snapshotPlayState(builtActor());
  assert.equal(snapshot.spellUses.get("key:e:tallfolk-innate-spells/s:n:glow-mote"), 1);
  const slot1 = snapshot.entries.get("key:e:arcane-prepared-spells").slot1;
  assert.equal(slot1.value, 3);
  assert.deepEqual([...slot1.expended], [
    ["key:e:arcane-prepared-spells/s:30", 1], ["key:e:arcane-prepared-spells/s:n:frost-thread", 1]
  ]);
});

test("a snapshot keeps the ChoiceSet selections per compendium source of every item, without unset or ignored rules", () => {
  const snapshot = snapshotPlayState(builtActor());
  assert.deepEqual([...snapshot.choices.keys()], [SKILL_SOURCE, SCHOOL_SOURCE, "Compendium.pf2e.feats-srd.Item.quickhands000001"]);
  assert.deepEqual([...snapshot.choices.get(SKILL_SOURCE)], ["occultism"]);
  assert.deepEqual([...snapshot.choices.get(SCHOOL_SOURCE)], ["Compendium.pf2e.classfeatures.Item.pathofember00001"]);
  assert.deepEqual([...snapshot.choices.get("Compendium.pf2e.feats-srd.Item.quickhands000001")], ["left"]);
});

test("a compendium source held by two items gives no previous choice, so neither copy repeats the other's answer", () => {
  const actor = builtActor();
  const twin = item("assurance0000002", "feat", "Assurance (Athletics)", { rules: [choiceRule("assurance", "athletics")] },
    { _stats: { compendiumSource: SKILL_SOURCE } });
  actor.items.push(twin);
  assert.equal(snapshotPlayState(actor).choices.has(SKILL_SOURCE), false);
});

test("the roots of a built actor are its flagged items, everything they grant and what sits in a deleted ABC item", () => {
  const ids = rootIdsToDelete(builtActor());
  for (const id of [
    "ancestry00000001", "background000001", "class00000000001", "assurance0000001", "schoolfeature001",
    "pathofember00001", "castaspell000001", "featslotted00001", "backpack00000001", "potion0000000001",
    "goldcoins0000001", "entryprepared001", "spellember00001", "spellglow000001"
  ]) {
    assert.ok(ids.includes(id), id);
  }
  for (const id of ["foundryonlyfeat1", "frightened000001", "wounded000000001", "foundryonlyitem1"]) {
    assert.ok(!ids.includes(id), id);
  }
});

test("grants of every onDelete kind are followed from either side of the link", () => {
  const actor = builtActor();
  actor.items = [
    builtItem("granter000000001", "feat", "Root Feat", "f:1", {}, {
      flags: { pf2e: { itemGrants: { a: { id: "detached00000001", onDelete: "detach" }, b: { id: "restricted000001", onDelete: "restrict" } } } }
    }),
    item("detached00000001", "feat", "Detached Child", {}),
    item("restricted000001", "action", "Restricted Child", {}),
    item("cascaded00000001", "feat", "Cascaded Grandchild", {}, { flags: { pf2e: { grantedBy: { id: "restricted000001", onDelete: "cascade" } } } }),
    item("unrelated0000001", "feat", "Unrelated", { location: "granter000000001" })
  ];
  assert.deepEqual(rootIdsToDelete(actor), ["granter000000001", "detached00000001", "restricted000001", "cascaded00000001"]);
});

test("a kept item inside a deleted container is put back once the container is recreated", () => {
  const snapshot = snapshotPlayState(builtActor());
  assert.deepEqual(snapshot.containers, [{ id: "foundryonlyitem1", containerId: "backpack00000001" }]);
  assert.deepEqual(containerRestores(snapshot, ["backpack00000001", "foundryonlyitem1"]),
    [{ _id: "foundryonlyitem1", "system.containerId": "backpack00000001" }]);
  assert.deepEqual(containerRestores(snapshot, ["foundryonlyitem1"]), []);
});

test("an actor the connector did not build loses every item except conditions and effects", () => {
  assert.equal(isBuiltActor(pushedActor()), false);
  assert.deepEqual(rootIdsToDelete(pushedActor()), [
    "oldclass00000001", "oldtonic00000001", "oldarrows0000001", "oldarrows0000002", "oldgold000000001",
    "oldentry00000001", "oldember00000001"
  ]);
  const snapshot = snapshotPlayState(pushedActor());
  assert.equal(snapshot.roots.size, 0);
  assert.equal(keptRootId(snapshot, "id:class"), null);
  assert.deepEqual(snapshot.containers, []);
});

test("an actor the connector did not build keeps item values by type and name, for names unique on both sides only", () => {
  const snapshot = snapshotPlayState(pushedActor());
  const rebuilt = [
    builtItem("newtonic00000001", "consumable", "Mint Tonic", "i:61", { quantity: 3, uses: { value: 1, max: 1 } }),
    builtItem("newarrows0000001", "ammo", "Reed Arrows", "i:70", { quantity: 20 }),
    builtItem("newgold000000001", "treasure", "Gold Pieces", "c:gp", { quantity: 15 }),
    builtItem("newcloak00000001", "armor", "Fog Cloak", "i:71", { quantity: 1, hp: { value: 5, max: 5 } })
  ];
  assert.deepEqual(itemStateUpdates(snapshot, rebuilt), [
    { _id: "newtonic00000001", "system.quantity": 1, "system.uses.value": 0 },
    { _id: "newgold000000001", "system.quantity": 4 }
  ]);
});

test("an actor the connector did not build keeps entries and spells by name", () => {
  const snapshot = snapshotPlayState(pushedActor());
  const rebuilt = [
    builtItem("newentry00000001", "spellcastingEntry", "Arcane Prepared Spells", "e:arcane-prepared-spells", {
      slots: { slot1: { max: 3, value: 3, prepared: [{ id: "newember00000001", expended: false }] } }
    }),
    builtItem("newember00000001", "spell", "Ember Lance", "e:arcane-prepared-spells/s:30", { location: { value: "newentry00000001" } })
  ];
  assert.deepEqual(entrySlotUpdates(snapshot, rebuilt), [{
    _id: "newentry00000001", "system.slots.slot1.value": 2,
    "system.slots.slot1.prepared": [{ id: "newember00000001", expended: true }]
  }]);
});

test("rebuilt items take the kept quantity, uses and HP by build key; new keys and unchanged values give no update", () => {
  const snapshot = snapshotPlayState(builtActor());
  const rebuilt = [
    builtItem("potion0000000001", "consumable", "Mint Tonic", "i:61", { quantity: 1, uses: { value: 1, max: 1 }, hp: { value: 1, max: 1 } }),
    builtItem("shield0000000001", "shield", "Oak Buckler", "i:62", { quantity: 1, hp: { value: 6, max: 6 } }),
    builtItem("goldcoins0000001", "treasure", "Gold Pieces", "c:gp", { quantity: 15 }),
    builtItem("newrope000000001", "equipment", "Silk Rope", "i:63", { quantity: 1 }),
    builtItem("class00000000001", "class", "Spellwright", "id:class", { hp: 6 })
  ];
  assert.deepEqual(itemStateUpdates(snapshot, rebuilt), [
    { _id: "potion0000000001", "system.quantity": 2, "system.uses.value": 0 },
    { _id: "shield0000000001", "system.hp.value": 3 },
    { _id: "goldcoins0000001", "system.quantity": 9 }
  ]);
});

test("kept item HP and uses stay within the rebuilt item's maximum", () => {
  const snapshot = snapshotPlayState(builtActor());
  const rebuilt = [builtItem("shield0000000001", "shield", "Oak Buckler", "i:62", { quantity: 1, hp: { value: 2, max: 2 } })];
  assert.deepEqual(itemStateUpdates(snapshot, rebuilt), []);
});

test("innate uses are kept within the rebuilt uses per day", () => {
  const snapshot = snapshotPlayState(builtActor());
  const glow = (value, max) => builtItem("spellglow000001", "spell", "Glow Mote", "e:tallfolk-innate-spells/s:n:glow-mote", {
    location: { value: "entryinnate00001", uses: { value, max } }
  });
  assert.deepEqual(spellUseUpdates(snapshot, [glow(3, 3)]), [{ _id: "spellglow000001", "system.location.uses.value": 1 }]);
  const lowered = { ...snapshot, spellUses: new Map([["key:e:tallfolk-innate-spells/s:n:glow-mote", 4]]) };
  assert.deepEqual(spellUseUpdates(lowered, [glow(2, 2)]), []);
  assert.deepEqual(spellUseUpdates(lowered, [glow(1, 2)]), [{ _id: "spellglow000001", "system.location.uses.value": 2 }]);
  const plain = builtItem("spellember00001", "spell", "Ember Lance", "e:arcane-prepared-spells/s:30", { location: { value: "x" } });
  assert.deepEqual(spellUseUpdates(snapshot, [plain]), []);
});

test("rebuilt slots keep their value within the new maximum and the expended marks per spell up to its new count", () => {
  const snapshot = snapshotPlayState(builtActor());
  const entry = builtItem("entryprepared001", "spellcastingEntry", "Arcane Prepared Spells", "e:arcane-prepared-spells", {
    slots: {
      slot0: { max: 5, value: 5, prepared: [] },
      slot1: { max: 2, value: 2, prepared: [
        { id: "spellember00001", expended: false }, { id: "spellfrost00001", expended: false }
      ] },
      slot2: { max: 1, value: 1, prepared: [{ id: "spellember00001", expended: true }] }
    }
  });
  const spells = [
    builtItem("spellember00001", "spell", "Ember Lance", "e:arcane-prepared-spells/s:30", {}),
    builtItem("spellfrost00001", "spell", "Frost Thread", "e:arcane-prepared-spells/s:n:frost-thread", {})
  ];
  assert.deepEqual(entrySlotUpdates(snapshot, [entry, ...spells]), [{
    _id: "entryprepared001",
    "system.slots.slot1.prepared": [{ id: "spellember00001", expended: true }, { id: "spellfrost00001", expended: true }]
  }]);
});

test("one prepared copy keeps one expended mark when the spell had two copies before, and a new entry gets nothing", () => {
  const actor = builtActor();
  actor.items.find((candidate) => candidate._id === "entryprepared001").system.slots.slot1.prepared = [
    { id: "spellember00001", expended: true }, { id: "spellember00001", expended: true }, { id: null, expended: false }
  ];
  const snapshot = snapshotPlayState(actor);
  const entry = builtItem("entryprepared001", "spellcastingEntry", "Arcane Prepared Spells", "e:arcane-prepared-spells", {
    slots: { slot1: { max: 3, value: 3, prepared: [{ id: "spellember00001", expended: false }, { id: null, expended: false }] } }
  });
  const fresh = builtItem("entrynew00000001", "spellcastingEntry", "Divine Spells", "e:divine-spells", {
    slots: { slot1: { max: 1, value: 0, prepared: [] } }
  });
  const ember = builtItem("spellember00001", "spell", "Ember Lance", "e:arcane-prepared-spells/s:30", {});
  assert.deepEqual(entrySlotUpdates(snapshot, [entry, fresh, ember]), [{
    _id: "entryprepared001",
    "system.slots.slot1.prepared": [{ id: "spellember00001", expended: true }, { id: null, expended: false }]
  }]);
});

test("the kept HP stays within the new maximum; temp HP, hero points and focus points within theirs", () => {
  const snapshot = snapshotPlayState(builtActor());
  assert.deepEqual(actorStateUpdate(snapshot, 78, 1), {
    "system.attributes.hp.value": 40,
    "system.attributes.hp.temp": 5,
    "system.resources.heroPoints.value": 2,
    "system.resources.focus.value": 0
  });
  assert.equal(actorStateUpdate(snapshot, 30, 1)["system.attributes.hp.value"], 30);
  const focused = { ...snapshot, actor: { ...snapshot.actor, focus: 3 } };
  assert.equal(actorStateUpdate(focused, 78, 2)["system.resources.focus.value"], 2);
  assert.deepEqual(actorStateUpdate({ actor: {} }, 78, 1), {});
});

test("a snapshot of an empty or odd source gives empty state and no deletes", () => {
  const snapshot = snapshotPlayState(null);
  assert.equal(snapshot.built, false);
  assert.equal(snapshot.choices.size, 0);
  assert.deepEqual(rootIdsToDelete({ items: [null, "x"] }), []);
  assert.deepEqual(itemStateUpdates(snapshot, null), []);
  assert.deepEqual(entrySlotUpdates(snapshot, undefined), []);
});
