import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { batchPrompt, needsBatchConfirm, refreshPrompt } from "../scripts/service/RefreshPrompt.mjs";

test("npc8 ux2 the single refresh prompt names what an NPC or loot actor keeps; only loot offers the restore box", () => {
  assert.deepEqual(refreshPrompt("Bramble Sentry", "npc"), { name: "Bramble Sentry", bodyKey: "ORGANIZR.Refresh.ActorBody", showRestore: false });
  assert.deepEqual(refreshPrompt("Mossy Chest", "loot"), { name: "Mossy Chest", bodyKey: "ORGANIZR.Refresh.LootBody", showRestore: true });
  for (const type of ["item", "spell", "action"]) {
    assert.deepEqual(refreshPrompt("Ember Lance", type), { name: "Ember Lance", bodyKey: "ORGANIZR.Refresh.ItemBody", showRestore: false });
  }
});

test("loot2 the batch asks only when it refreshes or skips, with the box only for skipped loot", () => {
  const onlyNew = { create: [{ fileId: 1 }], refresh: [], skippedLoot: [] };
  assert.equal(needsBatchConfirm(onlyNew), false);

  const refreshing = { create: [{ fileId: 1 }], refresh: [{ fileId: 2 }], skippedLoot: [] };
  assert.equal(needsBatchConfirm(refreshing), true);
  assert.deepEqual(batchPrompt(refreshing), { create: 1, refresh: 1, characters: 0, skipped: 0, showRestore: false });

  const skipping = { create: [], refresh: [], skippedLoot: [{ fileId: 3 }, { fileId: 4 }] };
  assert.equal(needsBatchConfirm(skipping), true);
  assert.deepEqual(batchPrompt(skipping), { create: 0, refresh: 0, characters: 0, skipped: 2, showRestore: true });
});

test("P14lang the refresh texts name buffs and the pf1 HP damage among what an actor keeps", async () => {
  const lang = JSON.parse(await readFile(new URL("../lang/en.json", import.meta.url), "utf8"));
  for (const text of [lang.ORGANIZR.Refresh.ActorBody, lang.ORGANIZR.Refresh.BatchKeeps]) {
    assert.match(text, /buffs/);
    assert.match(text, /pf1/i);
  }
});

test("a character refresh names what it keeps and that items, currency and XP are replaced", async () => {
  assert.deepEqual(refreshPrompt("Ilva Test", "character"),
    { name: "Ilva Test", bodyKey: "ORGANIZR.Refresh.CharacterBody", showRestore: false });
  const lang = JSON.parse(await readFile(new URL("../lang/en.json", import.meta.url), "utf8"));
  const replaced = "Items, currency and XP are replaced with Organizr's; send the character to Organizr first to keep changes made in Foundry.";
  assert.ok(lang.ORGANIZR.Refresh.CharacterBody.endsWith(replaced));
  assert.match(lang.ORGANIZR.Refresh.CharacterBody, /nonlethal/);
  assert.match(lang.ORGANIZR.Refresh.BatchCharacters, /items, currency and XP/);
});

test("the batch prompt counts the characters it refreshes", () => {
  const plan = { create: [{ fileId: 1, type: "character" }], refresh: [{ fileId: 2, type: "character" }, { fileId: 3, type: "npc" }], skippedLoot: [] };
  assert.deepEqual(batchPrompt(plan), { create: 1, refresh: 2, characters: 1, skipped: 0, showRestore: false });
});
