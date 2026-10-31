import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createSeed, importDataApplies, refreshedDocument, seededDocument
} from "../scripts/service/DocumentRefresh.mjs";

const MODULE = "organizr-foundry-connector";
const OLD_PORTRAIT = "worlds/test-world/organizr-portraits/12.png";
const NEW_PORTRAIT = "worlds/test-world/organizr-portraits/12.webp";

function npcCurrent() {
  return {
    _id: "npcCurrent000001",
    name: "Bramble Sentry",
    type: "npc",
    img: OLD_PORTRAIT,
    prototypeToken: {
      name: "Custom Token Name",
      disposition: 1,
      actorLink: false,
      width: 1,
      sight: { enabled: true, range: 30 },
      texture: { src: OLD_PORTRAIT, scaleX: 1.2 }
    },
    system: { attributes: { hp: { value: 7, temp: 3, max: 15 } }, details: { level: { value: 2 } } },
    items: [
      { _id: "strikeOld0000001", name: "Old Thorn", type: "melee" },
      { _id: "effectItem000001", name: "Effect: Inspired", type: "effect" },
      { _id: "condition0000001", name: "Frightened", type: "condition" }
    ],
    effects: [{ _id: "activeEffect0001", name: "Blessed" }],
    flags: { core: { sheetClass: "x" }, [MODULE]: { sheet: { fileId: 12, portraitFileId: 11 } } }
  };
}

function npcIncoming() {
  return {
    name: "Bramble Sentry",
    type: "npc",
    img: NEW_PORTRAIT,
    system: { _migration: { version: 0.959 }, attributes: { hp: { value: 15, temp: 0, max: 15 } }, details: { level: { value: 3 } } },
    items: [{ _id: "strikeNew0000001", name: "New Thorn", type: "melee" }],
    effects: [],
    flags: { [MODULE]: { sheet: { fileId: 12, projectId: 1, type: "npc", portraitFileId: 11 } } }
  };
}

function lootCurrent() {
  const gold = { _id: "goldCoins0000001", name: "Gold Pieces", type: "treasure", system: { quantity: 1, category: "coin" } };
  const items = [gold];
  for (let index = 2; index <= 9; index += 1) items.push({ _id: `lootItem${String(index).padStart(8, "0")}`, name: `Trinket ${index}`, type: "equipment" });
  return {
    name: "Mossy Chest",
    type: "loot",
    img: "systems/pf2e/icons/default-icons/loot.svg",
    prototypeToken: { name: "Mossy Chest", actorLink: true, width: 2, texture: { src: "icons/containers/chest/chest-wooden-tied-white.webp" } },
    system: { lootSheetType: "Loot" },
    items: [...items, { _id: "lootEffect000001", name: "Effect: Trapped", type: "effect" }],
    effects: [],
    flags: { [MODULE]: { sheet: { fileId: 30 } } }
  };
}

function lootIncoming() {
  const items = [{ _id: "goldCoins0000001", name: "Gold Pieces", type: "treasure", system: { quantity: 75, category: "coin" } }];
  for (let index = 2; index <= 10; index += 1) items.push({ _id: `lootItem${String(index).padStart(8, "0")}`, name: `Trinket ${index}`, type: "equipment" });
  return {
    name: "Mossy Chest",
    type: "loot",
    img: "icons/containers/chest/chest-wooden-tied-white.webp",
    system: { lootSheetType: "Loot", description: { value: "<p>New text</p>" } },
    items,
    flags: { [MODULE]: { sheet: { fileId: 30, type: "loot" } } }
  };
}

test("npc8 keeps token, HP 7, effect and condition", () => {
  const result = refreshedDocument(npcCurrent(), npcIncoming());
  assert.equal(result.prototypeToken.name, "Custom Token Name");
  assert.equal(result.prototypeToken.disposition, 1);
  assert.equal(result.prototypeToken.actorLink, false);
  assert.deepEqual(result.prototypeToken.sight, { enabled: true, range: 30 });
  assert.deepEqual(result.prototypeToken.texture, { src: NEW_PORTRAIT, scaleX: 1.2 });
  assert.equal(result.img, NEW_PORTRAIT);
  assert.equal(result.system.attributes.hp.value, 7);
  assert.equal(result.system.attributes.hp.temp, 3);
  assert.equal(result.system.attributes.hp.max, 15);
  assert.equal(result.system.details.level.value, 3);
  assert.deepEqual(result.items.map((item) => item.name), ["New Thorn", "Effect: Inspired", "Frightened"]);
  assert.deepEqual(result.effects, [{ _id: "activeEffect0001", name: "Blessed" }]);
});

test("a custom token texture stays when the actor image changes", () => {
  const current = npcCurrent();
  current.prototypeToken.texture.src = "tokens/bramble-ring.webp";
  const result = refreshedDocument(current, npcIncoming());
  assert.equal(result.prototypeToken.texture.src, "tokens/bramble-ring.webp");
});

test("an empty or mystery-man token texture follows the incoming image", () => {
  const empty = npcCurrent();
  delete empty.prototypeToken.texture.src;
  assert.equal(refreshedDocument(empty, npcIncoming()).prototypeToken.texture.src, NEW_PORTRAIT);
  const mystery = npcCurrent();
  mystery.prototypeToken.texture.src = "icons/svg/mystery-man.svg";
  assert.equal(refreshedDocument(mystery, npcIncoming()).prototypeToken.texture.src, NEW_PORTRAIT);
});

test("loot1 keeps actorLink true and the chest texture", () => {
  const result = refreshedDocument(lootCurrent(), lootIncoming());
  assert.equal(result.prototypeToken.actorLink, true);
  assert.equal(result.prototypeToken.width, 2);
  assert.equal(result.prototypeToken.texture.src, "icons/containers/chest/chest-wooden-tied-white.webp");
  assert.notEqual(result.prototypeToken.texture.src, "icons/svg/mystery-man.svg");
});

test("loot2 keeps the looted inventory", () => {
  const current = lootCurrent();
  const kept = refreshedDocument(current, lootIncoming());
  assert.equal(kept.items.filter((item) => item.type !== "effect").length, 9);
  assert.equal(kept.items.find((item) => item.name === "Gold Pieces").system.quantity, 1);
  assert.deepEqual(kept.items, current.items);
  assert.equal(kept.system.description.value, "<p>New text</p>");

  const restored = refreshedDocument(lootCurrent(), lootIncoming(), { restoreInventory: true });
  assert.equal(restored.items.length, 11);
  assert.equal(restored.items.find((item) => item.name === "Gold Pieces").system.quantity, 75);
  assert.equal(restored.items.at(-1).name, "Effect: Trapped");
});

test("HP is clamped to a lower new max and kept without numbers", () => {
  const current = npcCurrent();
  current.system.attributes.hp.value = 14;
  const incoming = npcIncoming();
  incoming.system.attributes.hp.max = 10;
  assert.equal(refreshedDocument(current, incoming).system.attributes.hp.value, 10);

  const noMax = npcIncoming();
  delete noMax.system.attributes.hp.max;
  assert.equal(refreshedDocument(current, noMax).system.attributes.hp.value, 14);

  const noHp = npcIncoming();
  delete noHp.system.attributes;
  assert.equal(refreshedDocument(current, noHp).system.attributes, undefined);
});

test("flags are merged per scope, incoming winning", () => {
  const result = refreshedDocument(npcCurrent(), npcIncoming());
  assert.deepEqual(result.flags.core, { sheetClass: "x" });
  assert.deepEqual(result.flags[MODULE], { sheet: { fileId: 12, projectId: 1, type: "npc", portraitFileId: 11 } });
});

test("items are untouched by actor rules", () => {
  const current = { name: "Old Blade", type: "weapon", img: "a.webp", system: { quantity: 1 }, flags: { core: { a: 1 } } };
  const incoming = { name: "New Blade", type: "weapon", img: "b.webp", system: { quantity: 1, traits: { value: ["sweep"] } }, flags: { [MODULE]: { sheet: { fileId: 3 } } } };
  const result = refreshedDocument(current, incoming);
  assert.deepEqual(result, { ...incoming, flags: { core: { a: 1 }, [MODULE]: { sheet: { fileId: 3 } } } });
  assert.equal("prototypeToken" in result, false);
  assert.equal("items" in result, false);
});

test("the inputs are not mutated and the result is a deep copy", () => {
  const current = npcCurrent();
  const incoming = npcIncoming();
  const currentText = JSON.stringify(current);
  const incomingText = JSON.stringify(incoming);
  const result = refreshedDocument(current, incoming, { tokenFromIncoming: true });
  result.system.attributes.hp.value = 0;
  result.prototypeToken.texture.src = "changed";
  result.items[1].name = "changed";
  assert.equal(JSON.stringify(current), currentText);
  assert.equal(JSON.stringify(incoming), incomingText);
});

test("tokenFromIncoming overlays the incoming prototype token, texture merged", () => {
  const created = {
    name: "Mossy Chest",
    type: "loot",
    img: "systems/pf2e/icons/default-icons/loot.svg",
    prototypeToken: { name: "Mossy Chest", actorLink: true, width: 1, texture: { src: "systems/pf2e/icons/default-icons/loot.svg", scaleX: 1, fit: "contain" } },
    system: {},
    items: [],
    effects: []
  };
  const incoming = { ...lootIncoming(), prototypeToken: { name: "Chest token", actorLink: true, texture: { src: "icons/containers/chest/chest-wooden-tied-white.webp" } } };
  const result = refreshedDocument(created, incoming, { restoreInventory: true, tokenFromIncoming: true });
  assert.equal(result.prototypeToken.name, "Chest token");
  assert.equal(result.prototypeToken.actorLink, true);
  assert.equal(result.prototypeToken.width, 1);
  assert.deepEqual(result.prototypeToken.texture, { src: "icons/containers/chest/chest-wooden-tied-white.webp", scaleX: 1, fit: "contain" });
  assert.equal(result.items.length, 10);
});

test("items14 spellsActions5 seededDocument takes the incoming HP and keeps the blank actor's default token", () => {
  const created = {
    name: "Bramble Sentry",
    type: "npc",
    img: "systems/pf2e/icons/default-icons/npc.svg",
    prototypeToken: { name: "Bramble Sentry", actorLink: false, disposition: -1, texture: { src: "systems/pf2e/icons/default-icons/npc.svg" } },
    system: { attributes: { hp: { value: 10, temp: 0, max: 10 } } },
    items: [],
    effects: []
  };
  const result = seededDocument(created, npcIncoming());
  assert.equal(result.system.attributes.hp.value, 15);
  assert.equal(result.prototypeToken.disposition, -1);
  assert.equal(result.prototypeToken.texture.src, NEW_PORTRAIT);
  assert.deepEqual(result.items.map((item) => item.name), ["New Thorn"]);
});

test("items14 spellsActions5 createSeed holds only name, type and flags", () => {
  const incoming = npcIncoming();
  const seed = createSeed(incoming);
  assert.deepEqual(Object.keys(seed), ["name", "type", "flags"]);
  assert.deepEqual(seed, { name: "Bramble Sentry", type: "npc", flags: incoming.flags });
  seed.flags[MODULE].sheet.fileId = 99;
  assert.equal(incoming.flags[MODULE].sheet.fileId, 12);
  assert.deepEqual(createSeed({ name: "Spark", type: "action" }).flags, {});
});

test("Import Data applies unless a pf2e document lacks system._migration", () => {
  assert.equal(importDataApplies("pf2e", npcIncoming()), true);
  assert.equal(importDataApplies("pf2e", { system: {} }), false);
  assert.equal(importDataApplies("pf2e", {}), false);
  assert.equal(importDataApplies("dnd5e", { system: {} }), true);
});

test("i8 a refresh keeps spent focus points and spell slots, clamped to the new maximum", () => {
  const current = npcCurrent();
  current.system.resources = { focus: { value: 1, max: 2 } };
  current.items.push({
    _id: "entryArcane00001", name: "Arcane Spells", type: "spellcastingEntry",
    system: { slots: { slot1: { value: 0, max: 3 }, slot2: { value: 2, max: 2 } } }
  });
  const incoming = npcIncoming();
  incoming.system.resources = { focus: { value: 2, max: 2 } };
  incoming.items = [
    ...(incoming.items ?? []),
    { _id: "entryArcane00001", name: "Arcane Spells", type: "spellcastingEntry",
      system: { slots: { slot1: { value: 3, max: 3 }, slot2: { value: 1, max: 1 } } } },
    { _id: "entryDivine00001", name: "Divine Spells", type: "spellcastingEntry",
      system: { slots: { slot1: { value: 2, max: 2 } } } }
  ];

  const result = refreshedDocument(current, incoming);

  assert.deepEqual(result.system.resources.focus, { value: 1, max: 2 });
  const arcane = result.items.find((item) => item._id === "entryArcane00001");
  assert.deepEqual(arcane.system.slots, { slot1: { value: 0, max: 3 }, slot2: { value: 1, max: 1 } });
  const divine = result.items.find((item) => item._id === "entryDivine00001");
  assert.deepEqual(divine.system.slots, { slot1: { value: 2, max: 2 } });
});

test("i8 a new document takes the incoming focus points", () => {
  const created = { name: "Bramble Sentry", type: "npc", prototypeToken: {}, system: { resources: { focus: { value: 0, max: 0 } } }, items: [] };
  const incoming = npcIncoming();
  incoming.system.resources = { focus: { value: 2, max: 2 } };

  assert.deepEqual(seededDocument(created, incoming).system.resources.focus, { value: 2, max: 2 });
});

const PF1_STATS = { systemId: "pf1", systemVersion: "11.11" };

function pf1NpcCurrent() {
  return {
    _id: "pf1Npc0000000001",
    name: "Reed Stalker",
    type: "npc",
    img: "icons/svg/mystery-man.svg",
    prototypeToken: { name: "Reed Stalker", actorLink: false, texture: { src: "icons/svg/mystery-man.svg" } },
    system: {
      attributes: {
        hp: { temp: 4, nonlethal: 2, offset: -9 },
        wounds: { offset: -3 },
        vigor: { temp: 1, offset: -2 },
        spells: { spellbooks: {
          primary: { name: "Spells Known", spells: { spell0: { base: 4, value: 1 }, spell1: { base: 3, value: 0 }, spell2: { base: 1 } } },
          spelllike: { name: "Spell-Like Abilities", spells: { spell0: { base: 0, value: 0 } } }
        } }
      }
    },
    items: [
      { _id: "organizratk00001", name: "Claw", type: "attack", system: {} },
      { _id: "organizrspl00001", name: "Mist Veil", type: "spell", system: { preparation: { value: 0, max: 2 } } },
      { _id: "organizrspl00002", name: "Glow Mote", type: "spell", system: { uses: { per: "day", value: 1, maxFormula: "3" } } },
      { _id: "buffInspired0001", name: "Inspired", type: "buff", system: { active: true, subType: "temp" } },
      { _id: "buffResting00001", name: "Resting", type: "buff", system: { active: false, subType: "temp" } }
    ],
    effects: [],
    flags: {},
    _stats: PF1_STATS
  };
}

function pf1NpcIncoming() {
  return {
    name: "Reed Stalker",
    type: "npc",
    img: "icons/svg/mystery-man.svg",
    system: {
      abilities: { str: { value: 14 } },
      attributes: {
        naturalAC: 2,
        spells: { spellbooks: {
          primary: { name: "Spells Known", spells: { spell0: { base: 4 }, spell1: { base: 4 }, spell2: { base: 2 } } },
          secondary: { name: "Spells Prepared", spells: { spell0: { base: 0 } } }
        } }
      }
    },
    items: [
      { _id: "organizratk00001", name: "Claw", type: "attack", system: {} },
      { _id: "organizrspl00001", name: "Mist Veil", type: "spell", system: { preparation: { value: 1, max: 1 } } },
      { _id: "organizrspl00002", name: "Glow Mote", type: "spell", system: { uses: { per: "day", value: 3, maxFormula: "3" } } },
      { _id: "organizrspl00003", name: "Fresh Spark", type: "spell", system: { uses: { per: "day", value: 2, maxFormula: "2" } } }
    ],
    effects: [],
    flags: {},
    _stats: PF1_STATS
  };
}

test("a pf1 refresh keeps damage, nonlethal and temporary HP although the export has no attributes.hp", () => {
  const result = refreshedDocument(pf1NpcCurrent(), pf1NpcIncoming());
  assert.deepEqual(result.system.attributes.hp, { offset: -9, nonlethal: 2, temp: 4 });
  assert.deepEqual(result.system.attributes.wounds, { offset: -3 });
  assert.deepEqual(result.system.attributes.vigor, { offset: -2, temp: 1 });
  assert.equal(result.system.attributes.naturalAC, 2);
  assert.deepEqual(result.system.abilities, { str: { value: 14 } });
});

test("a pf1 refresh creates system.attributes when the export has none and copies only present keys", () => {
  const current = pf1NpcCurrent();
  current.system.attributes = { hp: { offset: -5 } };
  const incoming = pf1NpcIncoming();
  delete incoming.system;
  const result = refreshedDocument(current, incoming);
  assert.deepEqual(result.system, { attributes: { hp: { offset: -5 } } });
});

test("a pf1 refresh keeps active and inactive buffs with their state", () => {
  const result = refreshedDocument(pf1NpcCurrent(), pf1NpcIncoming());
  const buffs = result.items.filter((item) => item.type === "buff");
  assert.deepEqual(buffs.map((item) => [item.name, item.system.active]), [["Inspired", true], ["Resting", false]]);
  assert.deepEqual(result.items.map((item) => item._id).slice(0, 4),
    ["organizratk00001", "organizrspl00001", "organizrspl00002", "organizrspl00003"]);
});

test("a pf1 refresh keeps the remaining casts per spellbook level of books still exported", () => {
  const result = refreshedDocument(pf1NpcCurrent(), pf1NpcIncoming());
  const books = result.system.attributes.spells.spellbooks;
  assert.deepEqual(books.primary.spells, { spell0: { base: 4, value: 1 }, spell1: { base: 4, value: 0 }, spell2: { base: 2 } });
  assert.deepEqual(books.secondary.spells, { spell0: { base: 0 } });
  assert.equal("spelllike" in books, false);
});

test("a pf1 refresh keeps remaining uses and prepared casts of items present in both, casts up to the new max", () => {
  const result = refreshedDocument(pf1NpcCurrent(), pf1NpcIncoming());
  const byId = new Map(result.items.map((item) => [item._id, item]));
  assert.deepEqual(byId.get("organizrspl00001").system.preparation, { value: 0, max: 1 });
  assert.deepEqual(byId.get("organizrspl00002").system.uses, { per: "day", value: 1, maxFormula: "3" });
  assert.deepEqual(byId.get("organizrspl00003").system.uses, { per: "day", value: 2, maxFormula: "2" });

  const current = pf1NpcCurrent();
  current.items[1].system.preparation = { value: 2, max: 2 };
  const clamped = refreshedDocument(current, pf1NpcIncoming());
  assert.deepEqual(clamped.items.find((item) => item._id === "organizrspl00001").system.preparation, { value: 1, max: 1 });
});

test("a pf1 refresh without keepPlayState takes the incoming state", () => {
  const result = refreshedDocument(pf1NpcCurrent(), pf1NpcIncoming(), { keepPlayState: false });
  assert.equal(result.system.attributes.hp, undefined);
  assert.equal(result.system.attributes.spells.spellbooks.primary.spells.spell0.value, undefined);
  assert.equal(result.items.find((item) => item._id === "organizrspl00002").system.uses.value, 3);
});

test("pf1 rules leave a pf2e actor alone: no HP created, uses and buffs untouched", () => {
  const current = npcCurrent();
  current._stats = { systemId: "pf2e" };
  current.system.attributes.hp.offset = -4;
  current.items.push({ _id: "potionHealing001", name: "Potion", type: "consumable", system: { uses: { value: 0, max: 1 } } });
  const incoming = npcIncoming();
  delete incoming.system.attributes;
  incoming.items.push({ _id: "potionHealing001", name: "Potion", type: "consumable", system: { uses: { value: 1, max: 1 } } });
  const result = refreshedDocument(current, incoming);
  assert.equal(result.system.attributes, undefined);
  assert.equal(result.items.find((item) => item._id === "potionHealing001").system.uses.value, 1);
});

function pf1ContainerCurrent() {
  return {
    _id: "pf1Chest00000001",
    name: "Sunken Coffer",
    type: "container",
    img: "icons/svg/chest.svg",
    system: {
      description: { value: "<p>Old text</p>" },
      items: { organizritm00001: { _id: "organizritm00001", name: "Pearl", type: "loot", system: { quantity: 1 } } },
      currency: { pp: 0, gp: 3, sp: 0, cp: 0 }
    },
    flags: { [MODULE]: { sheet: { fileId: 44 } } },
    _stats: PF1_STATS
  };
}

function pf1ContainerIncoming() {
  return {
    name: "Sunken Coffer",
    type: "container",
    img: "icons/svg/chest.svg",
    system: {
      description: { value: "<p>New text</p>" },
      items: {
        organizritm00001: { _id: "organizritm00001", name: "Pearl", type: "loot", system: { quantity: 4 } },
        organizritm00002: { _id: "organizritm00002", name: "Silver Comb", type: "equipment", system: { quantity: 1 } }
      },
      currency: { pp: 1, gp: 40, sp: 5, cp: 0 }
    },
    flags: { [MODULE]: { sheet: { fileId: 44, type: "loot" } } },
    _stats: PF1_STATS
  };
}

test("a pf1 container refreshed without restoring keeps its contents and coins", () => {
  const current = pf1ContainerCurrent();
  const result = refreshedDocument(current, pf1ContainerIncoming());
  assert.deepEqual(result.system.items, current.system.items);
  assert.deepEqual(result.system.currency, { pp: 0, gp: 3, sp: 0, cp: 0 });
  assert.equal(result.system.description.value, "<p>New text</p>");
  assert.equal("items" in result, false);
  assert.equal("prototypeToken" in result, false);
  result.system.items.organizritm00001.name = "changed";
  assert.equal(current.system.items.organizritm00001.name, "Pearl");
});

test("a pf1 container refreshed with restoreInventory takes the exported contents and coins", () => {
  const result = refreshedDocument(pf1ContainerCurrent(), pf1ContainerIncoming(), { restoreInventory: true });
  assert.deepEqual(Object.keys(result.system.items), ["organizritm00001", "organizritm00002"]);
  assert.equal(result.system.items.organizritm00001.system.quantity, 4);
  assert.deepEqual(result.system.currency, { pp: 1, gp: 40, sp: 5, cp: 0 });
});

test("container contents stay outside pf1 and for other pf1 item types", () => {
  const dnd = pf1ContainerCurrent();
  dnd._stats = { systemId: "dnd5e" };
  assert.equal(refreshedDocument(dnd, pf1ContainerIncoming()).system.currency.gp, 40);

  const lootCurrentItem = { ...pf1ContainerCurrent(), type: "loot" };
  const lootIncomingItem = { ...pf1ContainerIncoming(), type: "loot" };
  assert.equal(refreshedDocument(lootCurrentItem, lootIncomingItem).system.currency.gp, 40);
});

test("Import Data applies to pf1 documents", () => {
  assert.equal(importDataApplies("pf1", pf1NpcIncoming()), true);
  assert.equal(importDataApplies("pf1", { system: {} }), true);
  assert.equal(importDataApplies("pf1", {}), true);
});
