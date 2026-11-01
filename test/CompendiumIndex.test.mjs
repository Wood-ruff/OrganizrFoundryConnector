import { test } from "node:test";
import assert from "node:assert/strict";
import { indexRow, indexRows, packSources } from "../scripts/persistence/CompendiumIndex.mjs";

function fakePack(entries, calls) {
  return {
    async getIndex(options) {
      calls.push({ getIndex: options });
      return new Map(entries.map((entry) => [entry._id, entry]));
    },
    async getDocuments(query) {
      calls.push({ getDocuments: query });
      const wanted = query._id__in;
      return entries.filter((entry) => wanted.includes(entry._id)).map((entry) => ({ toObject: () => ({ ...entry }) }));
    }
  };
}

function installPacks(packs) {
  globalThis.game = { packs: new Map(Object.entries(packs)) };
}

const feat = {
  _id: "f1", uuid: "Compendium.example.feats.Item.f1", name: "Sturdy Stance", type: "feat",
  system: { slug: "sturdy-stance", category: "general", level: { value: 3 } }
};

test("indexRows reads a pack's index once with the match fields and shapes the rows", async () => {
  const calls = [];
  installPacks({ "example.feats": fakePack([feat, { _id: "c1", name: "Bare", type: "class" }], calls) });

  const rows = await indexRows("example.feats");
  const again = await indexRows("example.feats");

  assert.equal(again, rows);
  assert.deepEqual(calls, [{ getIndex: { fields: ["system.slug", "system.category", "system.level.value"] } }]);
  assert.deepEqual(rows, [
    { id: "f1", uuid: "Compendium.example.feats.Item.f1", name: "Sturdy Stance", type: "feat", slug: "sturdy-stance",
      category: "general", level: 3, pack: "example.feats" },
    { id: "c1", uuid: "Compendium.example.feats.Item.c1", name: "Bare", type: "class", slug: null, category: null,
      level: null, pack: "example.feats" }
  ]);
});

test("concurrent reads of one pack share one index request", async () => {
  const calls = [];
  installPacks({ "example.shared": fakePack([feat], calls) });
  const [first, second] = await Promise.all([indexRows("example.shared"), indexRows("example.shared")]);
  assert.equal(first, second);
  assert.equal(calls.length, 1);
});

test("a pack the world lacks has no rows", async () => {
  installPacks({});
  assert.deepEqual(await indexRows("example.absent"), []);
  assert.deepEqual(await packSources("example.absent", ["x"]), []);
});

test("a failed index read is retried on the next call", async () => {
  let attempts = 0;
  installPacks({
    "example.flaky": {
      async getIndex() {
        attempts += 1;
        if (attempts === 1) throw new Error("index unavailable");
        return [feat];
      }
    }
  });
  await assert.rejects(indexRows("example.flaky"), /index unavailable/);
  const rows = await indexRows("example.flaky");
  assert.equal(rows.length, 1);
  assert.equal(attempts, 2);
});

test("packSources loads the wanted documents in one request, ids deduplicated", async () => {
  const calls = [];
  const other = { _id: "f2", name: "Quick Hands", type: "feat", system: {} };
  installPacks({ "example.sources": fakePack([feat, other], calls) });

  const sources = await packSources("example.sources", ["f2", "f1", "f2"]);

  assert.deepEqual(calls, [{ getDocuments: { _id__in: ["f2", "f1"] } }]);
  assert.deepEqual(sources.map((source) => source._id).sort(), ["f1", "f2"]);
});

test("packSources without ids asks nothing", async () => {
  const calls = [];
  installPacks({ "example.none": fakePack([feat], calls) });
  assert.deepEqual(await packSources("example.none", []), []);
  assert.deepEqual(await packSources("example.none", undefined), []);
  assert.deepEqual(calls, []);
});

test("indexRow falls back to an item uuid and blank text fields", () => {
  assert.deepEqual(indexRow({ _id: "z9" }, "example.pack"), {
    id: "z9", uuid: "Compendium.example.pack.Item.z9", name: "", type: "", slug: null, category: null, level: null,
    pack: "example.pack"
  });
});
