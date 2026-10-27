import { test } from "node:test";
import assert from "node:assert/strict";
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
  assert.deepEqual(batchPrompt(refreshing), { create: 1, refresh: 1, skipped: 0, showRestore: false });

  const skipping = { create: [], refresh: [], skippedLoot: [{ fileId: 3 }, { fileId: 4 }] };
  assert.equal(needsBatchConfirm(skipping), true);
  assert.deepEqual(batchPrompt(skipping), { create: 0, refresh: 0, skipped: 2, showRestore: true });
});
