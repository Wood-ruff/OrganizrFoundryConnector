import { test } from "node:test";
import assert from "node:assert/strict";
import { actorRefreshUpdate } from "../scripts/service/Pf2eActorRefresh.mjs";

const MODULE = "organizr-foundry-connector";

function seed(overrides = {}) {
  return {
    name: "Wren Halloway",
    img: "worlds/example/organizr/portrait-9.webp",
    type: "character",
    _stats: { systemId: "pf2e" },
    flags: { [MODULE]: { sheet: { fileId: 41 }, build: { version: 1 } } },
    system: {
      details: { level: { value: 7 }, xp: { value: 120 }, languages: { value: ["elven"] }, biography: {} },
      skills: { arcana: { rank: 2 } },
      build: { attributes: { boosts: { "1": ["str", "dex", "con", "int"], "5": ["str", "dex", "con", "int"] } } }
    },
    ...overrides
  };
}

test("the rebuild update takes the seed's name, flags and system data but not its type or stats", () => {
  const update = actorRefreshUpdate(seed(), { img: "a.webp", prototypeToken: { texture: { src: "token.webp" } } });
  assert.equal(update.name, "Wren Halloway");
  assert.deepEqual(update.flags, { [MODULE]: { sheet: { fileId: 41 }, build: { version: 1 } } });
  assert.equal(update.system.details.level.value, 7);
  assert.equal(update.type, undefined);
  assert.equal(update._stats, undefined);
});

test("with boosts the manual attributes are cleared and every boost level the plan leaves out is emptied", () => {
  const update = actorRefreshUpdate(seed(), {});
  assert.equal(update.system.abilities, null);
  assert.deepEqual(update.system.build.attributes.boosts, {
    "1": ["str", "dex", "con", "int"], "5": ["str", "dex", "con", "int"], "10": [], "15": [], "20": []
  });
});

test("manual attributes stay manual and keep the boosts untouched", () => {
  const manual = seed();
  delete manual.system.build;
  manual.system.abilities = { str: { mod: 4 } };
  const update = actorRefreshUpdate(manual, {});
  assert.deepEqual(update.system.abilities, { str: { mod: 4 } });
  assert.equal(update.system.build, undefined);
});

test("the prototype token follows the new image only when it showed the actor image", () => {
  const following = actorRefreshUpdate(seed(), { img: "old.webp", prototypeToken: { texture: { src: "old.webp" } } });
  assert.equal(following.img, "worlds/example/organizr/portrait-9.webp");
  assert.deepEqual(following.prototypeToken, { texture: { src: "worlds/example/organizr/portrait-9.webp" } });
  const ownToken = actorRefreshUpdate(seed(), { img: "old.webp", prototypeToken: { texture: { src: "own-token.webp" } } });
  assert.equal(ownToken.prototypeToken, undefined);
});

test("a seed without an image keeps the actor's image and token", () => {
  const noImage = seed();
  delete noImage.img;
  const update = actorRefreshUpdate(noImage, { img: "old.webp", prototypeToken: { texture: { src: "old.webp" } } });
  assert.equal("img" in update, false);
  assert.equal(update.prototypeToken, undefined);
});

test("the update never changes the seed it was made from", () => {
  const source = seed();
  const before = structuredClone(source);
  actorRefreshUpdate(source, {});
  assert.deepEqual(source, before);
});
