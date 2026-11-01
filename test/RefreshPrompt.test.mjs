import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { batchImportOptions, batchPrompt, batchRestore, needsBatchConfirm, refreshPrompt } from "../scripts/service/RefreshPrompt.mjs";

const BATCH_KEYS = {
  keepsKey: "ORGANIZR.Refresh.BatchKeeps",
  charactersKey: "ORGANIZR.Refresh.BatchCharacters",
  skippedKey: "ORGANIZR.Refresh.BatchSkipped",
  restoreKey: "ORGANIZR.Refresh.BatchRestore",
  showCharacterRestore: false,
  characterRestoreKey: "ORGANIZR.Refresh.Pf2e.BatchRestoreCharacters"
};

async function readLang() {
  return JSON.parse(await readFile(new URL("../lang/en.json", import.meta.url), "utf8"));
}

test("npc8 ux2 the single refresh prompt names what an NPC or loot actor keeps; only loot offers the restore box", () => {
  const restoreKey = "ORGANIZR.Refresh.RestoreInventory";
  assert.deepEqual(refreshPrompt("Bramble Sentry", "npc"), { name: "Bramble Sentry", bodyKey: "ORGANIZR.Refresh.ActorBody", restoreKey, showRestore: false });
  assert.deepEqual(refreshPrompt("Mossy Chest", "loot", "pf2e"), { name: "Mossy Chest", bodyKey: "ORGANIZR.Refresh.LootBody", restoreKey, showRestore: true });
  for (const type of ["item", "spell", "action"]) {
    assert.deepEqual(refreshPrompt("Ember Lance", type), { name: "Ember Lance", bodyKey: "ORGANIZR.Refresh.ItemBody", restoreKey, showRestore: false });
  }
});

test("loot2 the batch asks only when it refreshes or skips, with the box only for skipped loot", () => {
  const onlyNew = { create: [{ fileId: 1 }], refresh: [], skippedLoot: [] };
  assert.equal(needsBatchConfirm(onlyNew), false);

  const refreshing = { create: [{ fileId: 1 }], refresh: [{ fileId: 2 }], skippedLoot: [] };
  assert.equal(needsBatchConfirm(refreshing), true);
  assert.deepEqual(batchPrompt(refreshing), { create: 1, refresh: 1, characters: 0, skipped: 0, showRestore: false, ...BATCH_KEYS });

  const skipping = { create: [], refresh: [], skippedLoot: [{ fileId: 3 }, { fileId: 4 }] };
  assert.equal(needsBatchConfirm(skipping), true);
  assert.deepEqual(batchPrompt(skipping), { create: 0, refresh: 0, characters: 0, skipped: 2, showRestore: true, ...BATCH_KEYS });
});

test("P14lang the refresh texts name buffs and the pf1 HP damage among what an actor keeps", async () => {
  const lang = await readLang();
  for (const text of [lang.ORGANIZR.Refresh.ActorBody, lang.ORGANIZR.Refresh.BatchKeeps]) {
    assert.match(text, /buffs/);
    assert.match(text, /pf1/i);
  }
});

test("a character refresh names what it keeps and that items, currency and XP are replaced", async () => {
  assert.deepEqual(refreshPrompt("Ilva Test", "character", "pf1"),
    { name: "Ilva Test", bodyKey: "ORGANIZR.Refresh.CharacterBody", restoreKey: "ORGANIZR.Refresh.RestoreInventory", showRestore: false });
  const lang = await readLang();
  const replaced = "Items, currency and XP are replaced with Organizr's; send the character to Organizr first to keep changes made in Foundry.";
  assert.ok(lang.ORGANIZR.Refresh.CharacterBody.endsWith(replaced));
  assert.match(lang.ORGANIZR.Refresh.CharacterBody, /nonlethal/);
  assert.match(lang.ORGANIZR.Refresh.BatchCharacters, /items, currency and XP/);
});

test("the batch prompt counts the characters it refreshes", () => {
  const plan = { create: [{ fileId: 1, type: "character" }], refresh: [{ fileId: 2, type: "character" }, { fileId: 3, type: "npc" }], skippedLoot: [] };
  assert.deepEqual(batchPrompt(plan, "pf1"), { create: 1, refresh: 2, characters: 1, skipped: 0, showRestore: false, ...BATCH_KEYS });
});

test("a dnd5e world reads its own actor, character, loot, restore and batch texts; items keep the shared text", () => {
  const dnd5e = "ORGANIZR.Refresh.Dnd5e";
  assert.deepEqual(refreshPrompt("Ashmaw Prowler", "npc", "dnd5e"),
    { name: "Ashmaw Prowler", bodyKey: `${dnd5e}.ActorBody`, restoreKey: `${dnd5e}.RestoreInventory`, showRestore: false });
  assert.equal(refreshPrompt("Tavrin Test", "character", "dnd5e").bodyKey, `${dnd5e}.CharacterBody`);
  assert.equal(refreshPrompt("Hollow Oak Satchel", "loot", "dnd5e").bodyKey, `${dnd5e}.LootBody`);
  assert.equal(refreshPrompt("Hollow Oak Satchel", "loot", "dnd5e").showRestore, true);
  assert.equal(refreshPrompt("Ashen Warpick", "item", "dnd5e").bodyKey, "ORGANIZR.Refresh.ItemBody");
  const plan = { create: [], refresh: [{ fileId: 2, type: "character" }], skippedLoot: [] };
  const prompt = batchPrompt(plan, "dnd5e");
  assert.equal(prompt.keepsKey, `${dnd5e}.BatchKeeps`);
  assert.equal(prompt.charactersKey, `${dnd5e}.BatchCharacters`);
  assert.equal(prompt.skippedKey, `${dnd5e}.BatchSkipped`);
  assert.equal(prompt.restoreKey, `${dnd5e}.BatchRestore`);
});

test("the pf batch restore box reads the same text as the single loot refresh", async () => {
  const texts = (await readLang()).ORGANIZR.Refresh;
  assert.equal(texts.BatchRestore, texts.RestoreInventory);
});

test("every dnd5e refresh text exists and names what a dnd5e refresh keeps", async () => {
  const texts = (await readLang()).ORGANIZR.Refresh.Dnd5e;
  for (const key of ["ActorBody", "CharacterBody", "LootBody", "RestoreInventory", "BatchKeeps", "BatchCharacters", "BatchSkipped", "BatchRestore"]) {
    assert.equal(typeof texts[key], "string", key);
  }
  for (const text of [texts.ActorBody, texts.BatchKeeps]) {
    assert.match(text, /death saves/);
    assert.match(text, /legendary actions/);
    assert.match(text, /exhaustion/);
    assert.doesNotMatch(text, /pf1|focus/);
  }
  assert.match(texts.LootBody, /contents/);
  assert.doesNotMatch(texts.LootBody, /current inventory/);
  assert.match(texts.BatchKeeps, /container from an item sheet keeps what it holds/);
  assert.match(texts.BatchSkipped, /\{count\} containers/);
  assert.match(texts.BatchRestore, /replaces what they hold/);
  for (const text of [texts.ActorBody, texts.CharacterBody, texts.BatchKeeps]) assert.match(text, /spent spell slots/);
  assert.doesNotMatch(texts.BatchCharacters, /currency/);
});

test("a pf2e character refresh reads the pf2e rebuild texts and offers the restore box", () => {
  const pf2e = "ORGANIZR.Refresh.Pf2e";
  assert.deepEqual(refreshPrompt("Wren Halloway", "character", "pf2e"),
    { name: "Wren Halloway", bodyKey: `${pf2e}.CharacterBody`, restoreKey: `${pf2e}.RestoreInventory`, showRestore: true });
});

test("in a pf2e world loot, NPCs and items keep the shared refresh texts", () => {
  assert.deepEqual(refreshPrompt("Mossy Chest", "loot", "pf2e"),
    { name: "Mossy Chest", bodyKey: "ORGANIZR.Refresh.LootBody", restoreKey: "ORGANIZR.Refresh.RestoreInventory", showRestore: true });
  assert.deepEqual(refreshPrompt("Bramble Sentry", "npc", "pf2e"),
    { name: "Bramble Sentry", bodyKey: "ORGANIZR.Refresh.ActorBody", restoreKey: "ORGANIZR.Refresh.RestoreInventory", showRestore: false });
  assert.equal(refreshPrompt("Ember Lance", "spell", "pf2e").bodyKey, "ORGANIZR.Refresh.ItemBody");
});

test("only a pf2e world switches characters to the rebuild texts; dnd5e and pf1 characters keep theirs", () => {
  assert.equal(refreshPrompt("Tavrin Test", "character", "dnd5e").bodyKey, "ORGANIZR.Refresh.Dnd5e.CharacterBody");
  assert.equal(refreshPrompt("Tavrin Test", "character", "dnd5e").showRestore, false);
  assert.equal(refreshPrompt("Ilva Test", "character", "pf1").bodyKey, "ORGANIZR.Refresh.CharacterBody");
  assert.equal(refreshPrompt("Ilva Test", "character").bodyKey, "ORGANIZR.Refresh.CharacterBody");
});

test("the batch prompt of a pf2e world reads the pf2e keeps and characters texts and offers the characters' box", () => {
  const plan = {
    create: [], refresh: [{ fileId: 2, type: "character", buildsFromRecipe: true }], skippedLoot: [{ fileId: 3, type: "loot" }]
  };
  assert.deepEqual(batchPrompt(plan, "pf2e"), {
    create: 0, refresh: 1, characters: 1, skipped: 1, showRestore: true, ...BATCH_KEYS,
    keepsKey: "ORGANIZR.Refresh.Pf2e.BatchKeeps",
    charactersKey: "ORGANIZR.Refresh.Pf2e.BatchCharacters",
    showCharacterRestore: true
  });
});

test("a pf2e batch without rebuilt characters shows no characters' box; other worlds never do", () => {
  const npcOnly = { create: [], refresh: [{ fileId: 4, type: "npc", buildsFromRecipe: false }], skippedLoot: [] };
  assert.equal(batchPrompt(npcOnly, "pf2e").showCharacterRestore, false);
  assert.equal(batchPrompt(npcOnly, "pf2e").keepsKey, "ORGANIZR.Refresh.Pf2e.BatchKeeps");
  const character = { create: [], refresh: [{ fileId: 2, type: "character", buildsFromRecipe: true }], skippedLoot: [] };
  for (const systemId of ["pf1", "dnd5e", ""]) assert.equal(batchPrompt(character, systemId).showCharacterRestore, false, systemId);
  assert.equal(batchPrompt(character, "pf1").keepsKey, "ORGANIZR.Refresh.BatchKeeps");
  assert.equal(batchPrompt(character, "dnd5e").keepsKey, "ORGANIZR.Refresh.Dnd5e.BatchKeeps");
});

test("the batch answer restores loot only when some was skipped and rebuilt characters only when their box was ticked", () => {
  const skipping = { create: [], refresh: [], skippedLoot: [{ fileId: 3, type: "loot" }] };
  const noSkip = { create: [], refresh: [], skippedLoot: [] };
  assert.deepEqual(batchRestore({ restoreInventory: true, restoreCharacters: false }, skipping), { inventory: true, characters: false });
  assert.deepEqual(batchRestore({ restoreInventory: true, restoreCharacters: true }, noSkip), { inventory: false, characters: true });
  assert.deepEqual(batchRestore({ restoreInventory: true }, skipping), { inventory: true, characters: false });
  assert.deepEqual(batchRestore(null, skipping), { inventory: false, characters: false });
});

test("each sheet of an Import all gets its own restore choice: rebuilt characters the characters' box, the rest the loot box", () => {
  const rebuilt = { fileId: 2, type: "character", buildsFromRecipe: true, uuid: "Actor.fxActor0000000002" };
  const npc = { fileId: 4, type: "npc", buildsFromRecipe: false, uuid: null };
  const pf1Character = { fileId: 5, type: "character", buildsFromRecipe: false };
  const charactersOnly = { inventory: false, characters: true };
  const lootOnly = { inventory: true, characters: false };

  assert.deepEqual(batchImportOptions(rebuilt, charactersOnly), { recordedUuid: "Actor.fxActor0000000002", restoreInventory: true });
  assert.deepEqual(batchImportOptions(rebuilt, lootOnly), { recordedUuid: "Actor.fxActor0000000002", restoreInventory: false });
  assert.deepEqual(batchImportOptions(npc, charactersOnly), { recordedUuid: null, restoreInventory: false });
  assert.deepEqual(batchImportOptions(npc, lootOnly), { recordedUuid: null, restoreInventory: true });
  assert.deepEqual(batchImportOptions(pf1Character, lootOnly), { recordedUuid: null, restoreInventory: true });
});

test("the pf2e batch keeps text names only what a pf2e refresh keeps", async () => {
  const texts = (await readLang()).ORGANIZR.Refresh.Pf2e;
  assert.doesNotMatch(texts.BatchKeeps, /pf1|buffs|nonlethal|prepared casts/);
  for (const kept of [/token/, /current HP/, /focus points/, /spell slots/, /conditions/, /effects/]) assert.match(texts.BatchKeeps, kept);
  assert.match(texts.BatchRestoreCharacters, /coins/);
});

test("the pf2e rebuild texts exist and name what a rebuilt character keeps and what Organizr replaces", async () => {
  const texts = (await readLang()).ORGANIZR.Refresh.Pf2e;
  for (const key of ["CharacterBody", "RestoreInventory", "BatchCharacters"]) assert.equal(typeof texts[key], "string", key);
  for (const kept of [/HP/, /hero points/, /conditions/, /focus points/, /spell slots/, /quantities/, /choices/]) {
    assert.match(texts.CharacterBody, kept);
  }
  for (const replaced of [/XP/, /equipped/, /prepared/]) assert.match(texts.CharacterBody, replaced);
  assert.match(texts.RestoreInventory, /coins/);
  assert.match(texts.BatchCharacters, /rebuilt/);
});
