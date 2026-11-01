import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { abcSources, actorSeed, languageValues, playStateUpdate } from "../scripts/service/Pf2eActorSeed.mjs";
import { SKILL_SLUGS } from "../scripts/service/Pf2eRecipe.mjs";
import { sluggify } from "./support/sluggify.mjs";

const MODULE = "organizr-foundry-connector";
const recipe = JSON.parse(readFileSync(new URL("./fixtures/pf2e-recipe.json", import.meta.url), "utf8"));
const document = {
  name: "Tessa Quillmoor",
  type: "character",
  img: "",
  _stats: { systemId: "pf2e" },
  flags: { [MODULE]: { sheet: { fileId: 41, projectId: 7, type: "character" } } }
};
const boosts = {
  ancestry: { selected: { "0": "str", "1": "dex" } },
  background: { selected: { "0": "str", "1": "con" } },
  keyAttribute: "str",
  boosts: { "1": ["str", "dex", "con", "int"], "5": ["str", "dex", "con", "wis"] },
  unspent: 0
};

test("the seed carries the level, xp and identity flags but no items, so the class comes later", () => {
  const seed = actorSeed(document, recipe, { boosts, languages: ["elven"] });
  assert.equal(seed.type, "character");
  assert.equal(seed.name, "Tessa Quillmoor");
  assert.equal(seed.img, undefined);
  assert.deepEqual(seed._stats, { systemId: "pf2e" });
  assert.equal(seed.system.details.level.value, 5);
  assert.equal(seed.system.details.xp.value, 400);
  assert.equal(seed.items, undefined);
  assert.deepEqual(seed.flags[MODULE], { sheet: { fileId: 41, projectId: 7, type: "character" }, build: { version: 1 } });
  assert.equal(document.flags[MODULE].build, undefined);
});

test("with a boost plan the seed holds the level boosts and no manual abilities", () => {
  const seed = actorSeed(document, recipe, { boosts, languages: [] });
  assert.deepEqual(seed.system.build, { attributes: { boosts: boosts.boosts } });
  assert.equal(seed.system.abilities, undefined);
  assert.equal(seed.system.details.keyability, undefined);
});

test("without a boost plan the seed holds manual abilities and the key attribute, never boosts", () => {
  const seed = actorSeed(document, recipe, { boosts: null, languages: [] });
  assert.equal(seed.system.build, undefined);
  assert.deepEqual(seed.system.abilities, {
    str: { mod: 4 }, dex: { mod: 2 }, con: { mod: 2 }, int: { mod: 1 }, wis: { mod: 1 }, cha: { mod: 0 }
  });
  assert.deepEqual(seed.system.details.keyability, { value: "str" });
});

test("the seed writes all 16 skill ranks, languages and the biography fields", () => {
  const seed = actorSeed(document, recipe, { boosts, languages: ["elven"] });
  assert.deepEqual(Object.keys(seed.system.skills), SKILL_SLUGS);
  assert.deepEqual(seed.system.skills.athletics, { rank: 2 });
  assert.deepEqual(seed.system.skills.arcana, { rank: 0 });
  assert.deepEqual(seed.system.details.languages, { value: ["elven"] });
  assert.deepEqual(seed.system.details.age, { value: "31" });
  assert.deepEqual(seed.system.details.gender, { value: "Female" });
  assert.equal(seed.system.details.height, undefined);
  assert.deepEqual(seed.system.details.biography, {
    appearance: "<p>Tall, with ink-stained fingers.</p>",
    backstory: "<p>She left the archive to see the roads.</p>"
  });
});

test("odd recipe values are clamped and unknown biography keys are left out", () => {
  const odd = { level: 44, xp: -5, skills: { athletics: 9, stealth: -1 }, biography: { facts: { mood: "x" },
    texts: { anathema: "<p>no</p>" } } };
  const seed = actorSeed({ name: "Odd" }, odd, null);
  assert.equal(seed.system.details.level.value, 30);
  assert.equal(seed.system.details.xp.value, 0);
  assert.deepEqual(seed.system.skills.athletics, { rank: 4 });
  assert.deepEqual(seed.system.skills.stealth, { rank: 0 });
  assert.equal(seed.system.details.mood, undefined);
  assert.deepEqual(seed.system.details.biography, {});
  assert.deepEqual(seed.system.details.languages, { value: [] });
  assert.equal(actorSeed({}, { level: 0 }, null).system.details.level.value, 1);
});

function abcFixtures() {
  return {
    ancestry: { name: "Wanderfolk", type: "ancestry", system: { boosts: { "0": { value: ["str", "dex"], selected: null },
      "1": { value: ["str", "dex", "con"], selected: null }, "2": { value: [], selected: null } } } },
    heritage: { name: "Hill Wanderfolk", type: "heritage", system: {} },
    background: { name: "Ledger Keeper", type: "background", system: { boosts: { "0": { value: ["str", "con"],
      selected: null }, "1": { value: ["str", "dex", "con"], selected: null } } } },
    class: { name: "Bladeward", type: "class", system: { keyAbility: { value: ["str", "dex"], selected: null } } },
    deity: null
  };
}

test("ABC sources come in creation order with the plan's boost selections and key attribute", () => {
  const sources = abcFixtures();
  const shaped = abcSources(sources, { boosts }, "dex");
  assert.deepEqual(shaped.map((source) => source.type), ["ancestry", "heritage", "background", "class"]);
  assert.equal(shaped[0].system.boosts["0"].selected, "str");
  assert.equal(shaped[0].system.boosts["1"].selected, "dex");
  assert.equal(shaped[0].system.boosts["2"].selected, null);
  assert.equal(shaped[2].system.boosts["1"].selected, "con");
  assert.equal(shaped[3].system.keyAbility.selected, "str");
  assert.equal(sources.ancestry.system.boosts["0"].selected, null);
});

test("an alternate ancestry plan writes the alternate boosts instead of slot selections", () => {
  const alternate = { ...boosts, ancestry: { alternate: ["con", "wis"] } };
  const [ancestry] = abcSources(abcFixtures(), { boosts: alternate }, "str");
  assert.deepEqual(ancestry.system.alternateAncestryBoosts, ["con", "wis"]);
  assert.equal(ancestry.system.boosts["0"].selected, null);
});

test("without boosts only an offered key attribute is chosen", () => {
  const manual = abcSources(abcFixtures(), { boosts: null }, "dex");
  assert.equal(manual[0].system.boosts["0"].selected, null);
  assert.equal(manual[3].system.keyAbility.selected, "dex");
  assert.equal(abcSources(abcFixtures(), null, "wis")[3].system.keyAbility.selected, null);
  assert.deepEqual(abcSources(null, null, "str"), []);
});

test("language names split into slugs to write, ancestry-granted ones and unknown ones", () => {
  const languages = { common: "Common", elven: "Elven", "sky-tongue": "Sky Tongue" };
  const names = ["Common", "elven", " Sky Tongue ", "Mumble", "Elven", "", null];
  assert.deepEqual(languageValues(names, languages, ["common"], sluggify), {
    value: ["elven", "sky-tongue"],
    granted: ["Common"],
    unknown: ["Mumble"]
  });
  assert.deepEqual(languageValues(null, null, null, sluggify), { value: [], granted: [], unknown: [] });
});

test("a language matches its localized label when the slug differs", () => {
  assert.deepEqual(languageValues(["Hochsprache"], { common: "Hochsprache" }, [], sluggify).value, ["common"]);
});

test("the play state keeps HP within the new maximum and focus within its pool", () => {
  assert.deepEqual(playStateUpdate(recipe, 68, 1), {
    "system.attributes.hp.value": 60,
    "system.attributes.hp.temp": 3,
    "system.resources.heroPoints.value": 1,
    "system.resources.focus.value": 0
  });
  const over = { hp: { current: 99, temp: -2 }, heroPoints: 2, focusPoints: 3 };
  assert.deepEqual(playStateUpdate(over, 50, 2), {
    "system.attributes.hp.value": 50,
    "system.attributes.hp.temp": 0,
    "system.resources.heroPoints.value": 2,
    "system.resources.focus.value": 2
  });
  assert.equal(playStateUpdate({ hp: { current: -4 } }, 30, 0)["system.attributes.hp.value"], 0);
  assert.equal(playStateUpdate({}, Number.NaN, Number.NaN)["system.resources.focus.value"], 0);
});
