import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { batchPrompt, needsBatchConfirm, refreshPrompt } from "../scripts/service/RefreshPrompt.mjs";

const BATCH_KEYS = {
  keepsKey: "ORGANIZR.Refresh.BatchKeeps",
  charactersKey: "ORGANIZR.Refresh.BatchCharacters",
  restoreKey: "ORGANIZR.Refresh.RestoreInventory"
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
  assert.equal(prompt.restoreKey, `${dnd5e}.RestoreInventory`);
});

test("every dnd5e refresh text exists and names what a dnd5e refresh keeps", async () => {
  const texts = (await readLang()).ORGANIZR.Refresh.Dnd5e;
  for (const key of ["ActorBody", "CharacterBody", "LootBody", "RestoreInventory", "BatchKeeps", "BatchCharacters"]) {
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
  assert.match(texts.BatchKeeps, /containers get Organizr's contents/);
  assert.doesNotMatch(texts.BatchCharacters, /currency/);
});
