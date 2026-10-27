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
