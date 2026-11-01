import { test } from "node:test";
import assert from "node:assert/strict";
import { sluggify } from "./support/sluggify.mjs";

const NAME = "[test] Quiet Seer";
const CLASS_ID = "seerclass0000001";
const MODULE = "organizr-foundry-connector";
const scene = { fetches: 0, create: async () => undefined, actors: { contents: [] } };

globalThis.fetch = async () => {
  scene.fetches += 1;
  return new Response(JSON.stringify(recipeAnswer()), { status: 200, headers: { "Content-Type": "application/json" } });
};
globalThis.Hooks = { on: () => 1, off: () => {} };
globalThis.foundry = { utils: { randomID: () => "freshid000000001" } };
globalThis.CONFIG = { PF2E: { languages: {} }, Actor: { documentClass: { create: (seed) => scene.create(seed) } } };
globalThis.ui = { notifications: { info: () => ({ update() {} }), remove() {} } };
globalThis.game = {
  settings: { get: (scope) => (scope === "pf2e" ? false : "https://organizr.example.invalid") },
  world: { id: "test-world", title: "Test World" },
  version: "14",
  system: { id: "pf2e", version: "8" },
  actors: scene.actors,
  items: { contents: [] },
  i18n: { format: (key, data) => `${key} ${JSON.stringify(data)}`, localize: (key) => key },
  pf2e: { system: { sluggify } },
  packs: { get: (packId) => (packId === "pf2e.classes" ? classPack() : undefined) }
};

const { importCharacterBuild } = await import("../scripts/entry/CharacterBuild.mjs");

function recipeAnswer() {
  return {
    document: { name: NAME, type: "character", img: "assets/test-portrait.webp" },
    recipe: { format: "organizr-pf2e-recipe", version: 1, name: NAME, identity: { class: { name: "Seer" } } }
  };
}

function classPack() {
  const source = { _id: CLASS_ID, name: "Seer", type: "class", system: { slug: "seer" } };
  return {
    getIndex: async () => new Map([[CLASS_ID, source]]),
    getDocuments: async () => [{ toObject: () => structuredClone(source) }]
  };
}

function failingActor({ deleteFails = false, deleteCancelled = false }) {
  const actor = {
    name: NAME,
    deleted: 0,
    items: [],
    async createEmbeddedDocuments() {
      throw new Error("write refused");
    },
    async delete() {
      actor.deleted += 1;
      if (deleteFails) throw new Error("delete refused");
      return deleteCancelled ? undefined : actor;
    }
  };
  return actor;
}

async function quietly(run) {
  const { error, warn } = console;
  console.error = () => {};
  console.warn = () => {};
  try {
    return await run();
  } finally {
    console.error = error;
    console.warn = warn;
  }
}

test("an actor create another module cancels gives the localized not-created error", async () => {
  scene.create = async () => undefined;
  const error = await quietly(() => importCharacterBuild("41").catch((caught) => caught));
  assert.equal(error.buildKey, "ORGANIZR.Build.Errors.NotCreated");
  assert.deepEqual(error.buildData, { name: NAME });
});

test("a failed build whose actor is removed says nothing was created", async () => {
  const actor = failingActor({ deleteFails: false });
  scene.create = async () => actor;
  const error = await quietly(() => importCharacterBuild("42").catch((caught) => caught));
  assert.equal(error.buildKey, "ORGANIZR.Build.Errors.Failed");
  assert.deepEqual(error.buildData, { name: NAME, message: "write refused" });
  assert.equal(actor.deleted, 1);
});

test("a failed build whose actor cannot be removed says the half-built actor is still there", async () => {
  const actor = failingActor({ deleteFails: true });
  scene.create = async () => actor;
  const error = await quietly(() => importCharacterBuild("43").catch((caught) => caught));
  assert.equal(error.buildKey, "ORGANIZR.Build.Errors.FailedKept");
  assert.deepEqual(error.buildData, { name: NAME, message: "write refused" });
  assert.equal(actor.deleted, 1);
});

test("a failed build whose actor delete another module cancels also says the half-built actor is still there", async () => {
  const actor = failingActor({ deleteCancelled: true });
  scene.create = async () => actor;
  const error = await quietly(() => importCharacterBuild("46").catch((caught) => caught));
  assert.equal(error.buildKey, "ORGANIZR.Build.Errors.FailedKept");
  assert.equal(actor.deleted, 1);
});

test("a second build waits until the first one finished, even when the first one fails", async () => {
  let releaseFirst;
  const firstCreate = new Promise((resolve) => (releaseFirst = resolve));
  scene.fetches = 0;
  scene.create = () => firstCreate;
  await quietly(async () => {
    const first = importCharacterBuild("44").catch((caught) => caught);
    const second = importCharacterBuild("45").catch((caught) => caught);
    while (scene.fetches === 0) await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(scene.fetches, 1);
    scene.create = async () => undefined;
    releaseFirst(undefined);
    assert.equal((await first).buildKey, "ORGANIZR.Build.Errors.NotCreated");
    assert.equal((await second).buildKey, "ORGANIZR.Build.Errors.NotCreated");
  });
  assert.equal(scene.fetches, 2);
});

/** A linked actor the connector built (build id "ownbuild"): its class root, a traded-in item and Gold Pieces. */
function linkedBuiltActor() {
  const state = {
    hp: 4,
    flags: { [MODULE]: { sheet: { fileId: 47 }, build: { version: 1, id: "ownbuild" } } },
    items: [
      { _id: "oldclass00000001", type: "class", name: "Seer", system: {}, flags: { [MODULE]: { build: { key: "id:class", owner: "ownbuild" } } } },
      { _id: "tradedtonic00001", type: "consumable", name: "Mint Tonic", system: { quantity: 1 }, flags: { [MODULE]: { build: { key: "i:9", owner: "otherbuild" } } } },
      { _id: "goldcoins0000001", type: "treasure", name: "Gold Pieces", system: { category: "coin", quantity: 3 }, flags: {} }
    ]
  };
  const calls = { setFlag: [], unsetFlag: 0, deleted: [], created: [], itemUpdates: [], updates: [] };
  const actor = {
    name: NAME,
    uuid: "Actor.linkedseer000001",
    documentName: "Actor",
    calls,
    get flags() {
      return state.flags;
    },
    system: { resources: { focus: { max: 0 } } },
    hitPoints: { max: 10 },
    get items() {
      return state.items.map((item) => ({ ...item, toObject: () => structuredClone(item) }));
    },
    state,
    toObject: () => structuredClone({
      name: NAME, type: "character", system: { attributes: { hp: { value: state.hp } } }, flags: state.flags, items: state.items
    }),
    async setFlag(scope, key, value) {
      calls.setFlag.push(key);
      state.flags[scope][key] = structuredClone(value);
    },
    async unsetFlag() {
      calls.unsetFlag += 1;
    },
    async deleteEmbeddedDocuments(type, ids) {
      calls.deleted.push(...ids);
      state.items = state.items.filter((item) => !ids.includes(item._id));
    },
    async createEmbeddedDocuments(type, sources) {
      calls.created.push(...structuredClone(sources));
      throw new Error("write refused");
    },
    async updateEmbeddedDocuments(type, updates) {
      calls.itemUpdates.push(...updates);
    },
    async update(update) {
      calls.updates.push(update);
    }
  };
  return actor;
}

test("a rebuild that fails after the delete keeps its play state on the actor and restores what it can", async () => {
  const actor = linkedBuiltActor();
  scene.actors.contents = [actor];
  try {
    const error = await quietly(() => importCharacterBuild("47").catch((caught) => caught));
    assert.equal(error.buildKey, "ORGANIZR.Build.Errors.RefreshFailed");
    assert.deepEqual(actor.calls.setFlag, ["pendingRebuild"]);
    assert.equal(actor.flags[MODULE].pendingRebuild.roots[0][0], "id:class");
    assert.deepEqual(actor.calls.deleted, ["oldclass00000001"]);
    assert.deepEqual(actor.calls.itemUpdates[0], { _id: "tradedtonic00001", [`flags.${MODULE}.build`]: null });
    assert.equal(actor.calls.unsetFlag, 0);
    assert.equal(actor.calls.created[0]._id, "oldclass00000001");
    assert.equal(actor.calls.created[0].flags[MODULE].build.owner, "ownbuild");
    assert.equal(actor.calls.updates.at(-1)["system.attributes.hp.value"], 4);
  } finally {
    scene.actors.contents = [];
  }
});

test("the next import after a failed rebuild takes the recorded play state instead of the half-built actor", async () => {
  const actor = linkedBuiltActor();
  scene.actors.contents = [actor];
  try {
    await quietly(() => importCharacterBuild("47").catch((caught) => caught));
    actor.calls.setFlag.length = 0;
    actor.calls.created.length = 0;
    actor.state.hp = 9;
    const error = await quietly(() => importCharacterBuild("47").catch((caught) => caught));
    assert.equal(error.buildKey, "ORGANIZR.Build.Errors.RefreshFailed");
    assert.deepEqual(actor.calls.setFlag, []);
    assert.equal(actor.calls.created[0]._id, "oldclass00000001");
    assert.equal(actor.calls.updates.at(-1)["system.attributes.hp.value"], 4);
  } finally {
    scene.actors.contents = [];
  }
});
