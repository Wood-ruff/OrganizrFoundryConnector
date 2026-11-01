import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ITEM_TYPES, PACKS, allowsBaseName, candidateRows, entryOutcome, isCovered, matchEntry
} from "../scripts/service/CompendiumMatch.mjs";
import { sluggify } from "./support/sluggify.mjs";

function row(name, { type = "feat", slug = sluggify(name), category = null, pack = "pf2e.feats-srd", id } = {}) {
  const rowId = id ?? `id-${slug}`;
  return { id: rowId, uuid: `Compendium.${pack}.Item.${rowId}`, name, type, slug, category, level: 1, pack };
}

const options = { sluggify };

test("the packs are searched in their pinned priority order", () => {
  assert.deepEqual(PACKS.features, ["pf2e.feats-srd", "pf2e.classfeatures", "pf2e.ancestryfeatures"]);
  assert.deepEqual(PACKS.class, ["pf2e.classes"]);
  assert.deepEqual(PACKS.coins, ["pf2e.equipment-srd"]);
  assert.ok(!ITEM_TYPES.inventory.includes("kit"));
  assert.deepEqual(ITEM_TYPES.inventory, [
    "equipment", "consumable", "weapon", "treasure", "armor", "ammo", "backpack", "shield"
  ]);
});

test("a slug hit wins over names", () => {
  const rows = [row("Glimmer Step", { slug: "glimmer-step" }), row("glimmer step", { slug: "other-slug" })];
  const match = matchEntry("Glimmer Step", rows, options);
  assert.equal(match.status, "compendium");
  assert.equal(match.row.slug, "glimmer-step");
  assert.equal(match.suffix, null);
});

test("without a slug hit the exact name matches", () => {
  const rows = [row("Ward Of Ash", { slug: "ash-ward" }), row("ward of ash", { slug: "ash-ward-two" })];
  const match = matchEntry("Ward Of Ash", rows, options);
  assert.equal(match.status, "compendium");
  assert.equal(match.row.slug, "ash-ward");
});

test("without an exact name a trimmed case-insensitive name matches", () => {
  const rows = [row("Ward Of Ash", { slug: "ash-ward" })];
  const match = matchEntry("  ward of ASH ", rows, options);
  assert.equal(match.status, "compendium");
  assert.equal(match.row.name, "Ward Of Ash");
});

test("a suffixed name falls back to its base and carries the suffix", () => {
  const rows = [row("Fighter Weapon Mastery", { category: "classfeature", pack: "pf2e.classfeatures" })];
  const match = matchEntry("Fighter Weapon Mastery (Sword)", rows, { sluggify, baseName: true });
  assert.equal(match.status, "compendium");
  assert.equal(match.row.name, "Fighter Weapon Mastery");
  assert.equal(match.suffix, "Sword");
});

test("the full name wins over the base name", () => {
  const rows = [row("Coil Rope"), row("Coil Rope (Hemp)")];
  const match = matchEntry("Coil Rope (Hemp)", rows, { sluggify, baseName: true });
  assert.equal(match.row.name, "Coil Rope (Hemp)");
  assert.equal(match.suffix, null);
});

test("without the base name rule a suffixed name is missing", () => {
  const rows = [row("Longsword", { type: "weapon", pack: "pf2e.equipment-srd" })];
  const entry = { name: "Longsword (Silver)", document: { type: "weapon" } };
  const match = matchEntry(entry.name, rows, { sluggify, baseName: allowsBaseName("inventory", entry) });
  assert.deepEqual(match, { status: "missing" });
  assert.equal(entryOutcome(match, entry), "custom");
});

test("only spells and gear with their own document skip the base name", () => {
  assert.equal(allowsBaseName("inventory", { document: { type: "weapon" } }), false);
  assert.equal(allowsBaseName("spells", { document: { type: "spell" } }), false);
  assert.equal(allowsBaseName("inventory", { document: null }), true);
  assert.equal(allowsBaseName("features", { document: { type: "feat" } }), true);
  assert.equal(allowsBaseName("identity", {}), true);
});

test("a duplicate slug narrows to the entry's category", () => {
  const rows = [
    row("Hold The Line", { id: "a", category: "class" }),
    row("Hold The Line", { id: "b", category: "general" })
  ];
  const match = matchEntry("Hold The Line", rows, { sluggify, category: "general" });
  assert.equal(match.status, "compendium");
  assert.equal(match.row.id, "b");
});

test("hits of several packs narrow to the first pack's", () => {
  const rows = [
    row("Night Vision Drill", { id: "feat", pack: "pf2e.feats-srd" }),
    row("Night Vision Drill", { id: "feature", pack: "pf2e.classfeatures" })
  ];
  const match = matchEntry("Night Vision Drill", rows, { sluggify, category: "class" });
  assert.equal(match.status, "compendium");
  assert.equal(match.row.id, "feat");
});

test("two hits of one category and pack stay ambiguous", () => {
  const rows = [
    row("Hold The Line", { id: "a", category: "class" }),
    row("Hold The Line", { id: "b", category: "class" })
  ];
  const match = matchEntry("Hold The Line", rows, { sluggify, category: "class" });
  assert.deepEqual(match, { status: "ambiguous", count: 2 });
  assert.equal(entryOutcome(match, { document: null }), "ambiguous");
  assert.equal(entryOutcome(match, { document: { type: "feat" } }), "custom");
});

test("nothing found is missing; a blank name finds nothing", () => {
  assert.deepEqual(matchEntry("Unknown Knack", [row("Toughness")], options), { status: "missing" });
  assert.deepEqual(matchEntry("  ", [row("Toughness")], options), { status: "missing" });
  assert.equal(entryOutcome({ status: "missing" }, { document: null }), "missing");
  assert.equal(entryOutcome({ status: "compendium", row: row("A") }, { document: {} }), "compendium");
});

test("inventory rows skip kits and keep pack order", () => {
  const rowsByPack = new Map([
    ["pf2e.equipment-srd", [
      row("Traveler Bundle", { type: "kit", pack: "pf2e.equipment-srd" }),
      row("Brass Lamp", { type: "equipment", pack: "pf2e.equipment-srd" })
    ]]
  ]);
  const rows = candidateRows("inventory", rowsByPack);
  assert.deepEqual(rows.map((entry) => entry.name), ["Brass Lamp"]);
  assert.deepEqual(matchEntry("Traveler Bundle", rows, options), { status: "missing" });
});

test("feature rows come from the three feat packs in priority order", () => {
  const rowsByPack = new Map([
    ["pf2e.ancestryfeatures", [row("Lowlight Eyes", { pack: "pf2e.ancestryfeatures" })]],
    ["pf2e.classfeatures", [row("Quick Guard", { pack: "pf2e.classfeatures" })]],
    ["pf2e.feats-srd", [row("Toughness"), row("Brass Lamp", { type: "equipment" })]]
  ]);
  const rows = candidateRows("features", rowsByPack);
  assert.deepEqual(rows.map((entry) => entry.name), ["Toughness", "Quick Guard", "Lowlight Eyes"]);
  assert.deepEqual(candidateRows("spells", rowsByPack), []);
  assert.deepEqual(candidateRows("unknown", rowsByPack), []);
});

test("an entry is covered by an item of that name or slug", () => {
  const items = [
    { name: "toughness", type: "feat", system: { slug: "toughness" } },
    { name: "Renamed Guard", type: "action", system: { slug: "shield-shove" } }
  ];
  assert.equal(isCovered({ key: "f:n:toughness", name: "Toughness" }, items, sluggify), true);
  assert.equal(isCovered({ key: "a:102", name: "Shield Shove" }, items, sluggify), true);
  assert.equal(isCovered({ key: "f:n:quick-step", name: "Quick Step" }, items, sluggify), false);
});

test("a suffixed entry is covered only by the same full name", () => {
  const items = [{ name: "Assurance (Athletics)", type: "feat", system: { slug: "assurance" } }];
  assert.equal(isCovered({ key: "f:n:assurance-medicine", name: "Assurance (Medicine)" }, items, sluggify), false);
  assert.equal(isCovered({ key: "f:n:assurance-athletics", name: "assurance (athletics)" }, items, sluggify), true);
});

test("a spell is covered by an actor spell at any location, never by a feat", () => {
  const spell = { key: "e:innate-gifts/s:n:dancing-mote", name: "Dancing Mote" };
  const elsewhere = [{ name: "Dancing Mote", type: "spell", system: { slug: "dancing-mote", location: { value: "x" } } }];
  assert.equal(isCovered(spell, elsewhere, sluggify), true);
  assert.equal(isCovered(spell, [{ name: "Dancing Mote", type: "feat", system: {} }], sluggify), false);
  assert.equal(isCovered({ key: "f:n:dancing-mote", name: "Dancing Mote" }, elsewhere, sluggify), false);
});

test("other item types and blank names never cover", () => {
  const items = [{ name: "Toughness", type: "equipment", system: { slug: "toughness" } }];
  assert.equal(isCovered({ key: "f:n:toughness", name: "Toughness" }, items, sluggify), false);
  assert.equal(isCovered({ key: "f:n:blank", name: " " }, [{ name: " ", type: "feat" }], sluggify), false);
  assert.equal(isCovered({ key: "f:n:x", name: "X" }, null, sluggify), false);
});
