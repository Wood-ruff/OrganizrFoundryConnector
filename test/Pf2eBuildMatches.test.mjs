import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classMatched, loadedKey, matchFindings, matchSources, neededPacks, packIdsOf, recipeMatches
} from "../scripts/service/Pf2eBuildMatches.mjs";
import { sluggify } from "./support/sluggify.mjs";

const MODULE = "organizr-foundry-connector";

function row(name, pack, { type = "feat", id = `id-${sluggify(name)}`, category = null, slug = sluggify(name) } = {}) {
  return { id, uuid: `Compendium.${pack}.Item.${id}`, name, type, slug, category, level: 1, pack };
}

function rowsByPack() {
  return new Map([
    ["pf2e.ancestries", [row("Gnollkin", "pf2e.ancestries", { type: "ancestry" })]],
    ["pf2e.heritages", [row("Ashborn Gnollkin", "pf2e.heritages", { type: "heritage" })]],
    ["pf2e.backgrounds", [row("Lamplighter", "pf2e.backgrounds", { type: "background" })]],
    ["pf2e.classes", [row("Warden", "pf2e.classes", { type: "class" })]],
    ["pf2e.feats-srd", [
      row("Iron Stance", "pf2e.feats-srd", { category: "class" }),
      row("Twin Echo", "pf2e.feats-srd", { id: "echo-a", category: "skill" }),
      row("Twin Echo", "pf2e.feats-srd", { id: "echo-b", category: "skill" }),
      row("Keen Study", "pf2e.feats-srd", { category: "skill" })
    ]],
    ["pf2e.classfeatures", [row("Warden Drill", "pf2e.classfeatures", { category: "classfeature" })]],
    ["pf2e.spells-srd", [row("Ember Lance", "pf2e.spells-srd", { type: "spell" })]],
    ["pf2e.equipment-srd", [
      row("Oak Staff", "pf2e.equipment-srd", { type: "weapon" }),
      row("Oak Staff Kit", "pf2e.equipment-srd", { type: "kit" }),
      row("Gold Pieces", "pf2e.equipment-srd", { type: "treasure", slug: "gold-pieces" })
    ]]
  ]);
}

function recipe(values = {}) {
  return {
    identity: {
      ancestry: { key: "id:ancestry", name: "Gnollkin" },
      heritage: { key: "id:heritage", name: "Ashborn Gnollkin" },
      background: { key: "id:background", name: "Lamplighter (Occultism)" },
      class: { key: "id:class", name: "Warden" },
      deity: null
    },
    features: [
      { key: "f:1", name: "Iron Stance", category: "class", level: 1, document: null },
      { key: "f:2", name: "Twin Echo", category: "skill", level: 2, document: null },
      { key: "f:3", name: "Keen Study (Arcana)", category: "skill", level: 2, document: null },
      { key: "f:4", name: "Warden Drill (Axe)", category: "classfeature", level: 1, document: null },
      { key: "f:5", name: "Homebrew Knack", category: "general", level: 3, document: { name: "Homebrew Knack", type: "feat" } },
      { key: "f:6", name: "Lost Talent", category: "general", level: 3, document: null }
    ],
    actions: [],
    spellcasting: [{ key: "e:gifts", name: "Gifts", spells: [{ key: "e:gifts/s:9", name: "Ember Lance", document: null }] }],
    inventory: [
      { key: "i:1", name: "Oak Staff", quantity: 1, runes: { potency: 1, striking: 0, property: [] }, document: null },
      { key: "i:2", name: "Oak Staff Kit", quantity: 1, runes: null, document: null },
      { key: "i:3", name: "Oak Staff (Carved)", quantity: 1, runes: null, document: { name: "Oak Staff (Carved)", type: "weapon" } }
    ],
    coins: { pp: 0, gp: 12, sp: 0, cp: 0, ep: 3 },
    ...values
  };
}

function byKey(matches) {
  return new Map(matches.entries.map((match) => [match.key, match]));
}

test("only the packs of the named identity and of filled lists are indexed", () => {
  assert.deepEqual(neededPacks(recipe()), [
    "pf2e.ancestries", "pf2e.heritages", "pf2e.backgrounds", "pf2e.classes",
    "pf2e.feats-srd", "pf2e.classfeatures", "pf2e.ancestryfeatures", "pf2e.spells-srd", "pf2e.equipment-srd"
  ]);
  const bare = { identity: { class: { name: "Warden" } }, coins: { gp: 0 } };
  assert.deepEqual(neededPacks(bare), ["pf2e.classes"]);
  assert.deepEqual(neededPacks({ identity: {}, coins: { cp: 4 } }), ["pf2e.equipment-srd"]);
  assert.deepEqual(neededPacks(null), []);
});

test("identity entries match with their base name and the class gates the build", () => {
  const matches = recipeMatches(recipe(), rowsByPack(), sluggify);
  assert.equal(matches.identity.background.status, "compendium");
  assert.equal(matches.identity.background.suffix, "Occultism");
  assert.equal(matches.identity.deity, null);
  assert.equal(classMatched(matches), true);
  const classless = recipe({ identity: { class: { key: "id:class", name: "Invented Calling" } } });
  assert.equal(classMatched(recipeMatches(classless, rowsByPack(), sluggify)), false);
  assert.equal(classMatched(null), false);
});

test("list entries are compendium, ambiguous, custom or missing", () => {
  const matches = byKey(recipeMatches(recipe(), rowsByPack(), sluggify));
  assert.equal(matches.get("f:1").status, "compendium");
  assert.equal(matches.get("f:2").status, "ambiguous");
  assert.equal(matches.get("f:2").count, 2);
  assert.equal(matches.get("f:3").suffix, "Arcana");
  assert.equal(matches.get("f:4").row.pack, "pf2e.classfeatures");
  assert.equal(matches.get("f:5").status, "custom");
  assert.equal(matches.get("f:6").status, "missing");
  assert.equal(matches.get("e:gifts/s:9").status, "compendium");
  assert.equal(matches.get("e:gifts/s:9").entry.castingKey, "e:gifts");
});

test("gear never matches a kit and an item with its own document keeps its suffix", () => {
  const matches = byKey(recipeMatches(recipe(), rowsByPack(), sluggify));
  assert.equal(matches.get("i:1").status, "compendium");
  assert.equal(matches.get("i:2").status, "missing");
  assert.equal(matches.get("i:3").status, "custom");
});

test("coins match pf2e's coin items by slug and electrum is counted aside", () => {
  const matches = recipeMatches(recipe(), rowsByPack(), sluggify);
  const coins = matches.entries.filter((match) => match.list === "coins");
  assert.deepEqual(coins.map((match) => [match.key, match.status, match.entry.quantity]), [["c:gp", "compendium", 12]]);
  assert.equal(matches.electrum, 3);
});

test("the ids to load are grouped per pack without repeats", () => {
  const twice = recipe({ features: [
    { key: "f:1", name: "Iron Stance", category: "class", level: 1 },
    { key: "f:1#2", name: "Iron Stance", category: "class", level: 1 }
  ] });
  const ids = packIdsOf(recipeMatches(twice, rowsByPack(), sluggify));
  assert.deepEqual(ids.get("pf2e.feats-srd"), ["id-iron-stance"]);
  assert.deepEqual(ids.get("pf2e.classes"), ["id-warden"]);
  assert.deepEqual(ids.get("pf2e.equipment-srd"), ["id-oak-staff", "id-gold-pieces"]);
  assert.equal(ids.has("pf2e.ancestryfeatures"), false);
});

test("sources are shaped per build key: compendium with runes and coin quantity, custom from the document", () => {
  const matches = recipeMatches(recipe(), rowsByPack(), sluggify);
  const loaded = new Map([
    [loadedKey("pf2e.classes", "id-warden"), { _id: "id-warden", name: "Warden", type: "class", system: { slug: "warden" } }],
    [loadedKey("pf2e.equipment-srd", "id-oak-staff"), { _id: "id-oak-staff", name: "Oak Staff", type: "weapon", system: {} }],
    [loadedKey("pf2e.equipment-srd", "id-gold-pieces"), { _id: "id-gold-pieces", name: "Gold Pieces", type: "treasure", system: { quantity: 1 } }]
  ]);
  const sources = matchSources(matches, loaded);
  const warden = sources.get("id:class");
  assert.equal(warden._id, undefined);
  assert.equal(warden._stats.compendiumSource, "Compendium.pf2e.classes.Item.id-warden");
  assert.deepEqual(warden.flags[MODULE].build, { key: "id:class" });
  assert.deepEqual(sources.get("i:1").system.runes, { potency: 1, striking: 0, property: [] });
  assert.equal(sources.get("c:gp").system.quantity, 12);
  assert.equal(sources.get("f:5").name, "Homebrew Knack");
  assert.deepEqual(sources.get("f:5").flags[MODULE].build, { key: "f:5" });
  assert.equal(sources.has("f:1"), false, "a compendium match whose source did not load has no source");
  assert.equal(sources.has("f:6"), false);
});

test("the findings list missing, ambiguous and custom entries with their report list", () => {
  const matches = recipeMatches(recipe({ identity: {
    ancestry: { key: "id:ancestry", name: "Unknown Folk" }, class: { key: "id:class", name: "Warden" }
  } }), rowsByPack(), sluggify);
  const findings = matchFindings(matches);
  assert.deepEqual(findings.missing, [
    { list: "identity", name: "Unknown Folk" },
    { list: "features", name: "Lost Talent" },
    { list: "inventory", name: "Oak Staff Kit" },
    { list: "coins", name: "3 ep" }
  ]);
  assert.deepEqual(findings.ambiguous, [{ list: "features", name: "Twin Echo", count: 2 }]);
  assert.deepEqual(findings.custom, [
    { list: "features", name: "Homebrew Knack" }, { list: "inventory", name: "Oak Staff (Carved)" }
  ]);
});

test("blank names are skipped and an empty recipe matches nothing", () => {
  const matches = recipeMatches(recipe({ features: [{ key: "f:n:", name: "  " }], inventory: [], spellcasting: [] }),
    rowsByPack(), sluggify);
  assert.equal(matches.entries.filter((match) => match.list !== "coins").length, 0);
  const empty = recipeMatches({}, new Map(), sluggify);
  assert.deepEqual(empty.entries, []);
  assert.equal(empty.electrum, 0);
  assert.deepEqual(matchFindings(empty), { missing: [], ambiguous: [], custom: [] });
});
