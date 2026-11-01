import { test } from "node:test";
import assert from "node:assert/strict";
import { coverUpdates } from "../scripts/service/CoverMarks.mjs";
import { sluggify } from "./support/sluggify.mjs";

const MODULE = "organizr-foundry-connector";
const COVERS = `flags.${MODULE}.build.covers`;

function actorItem(id, name, type, { build = null, location = undefined } = {}) {
  const flags = build ? { [MODULE]: { build } } : {};
  const system = { slug: sluggify(name) };
  if (location !== undefined) system.location = { value: location };
  return { id, _id: id, name, type, system, flags };
}

test("an item pf2e granted for a feature or action the build did not create is marked with that entry's key", () => {
  const recipe = {
    features: [{ key: "f:61", name: "Steady Guard" }],
    actions: [{ key: "a:62", name: "Reed Step" }, { key: "a:63", name: "Marsh Howl" }]
  };
  const items = [
    actorItem("grantedguard0001", "Steady Guard", "feat"),
    actorItem("grantedstep00001", "Reed Step", "action"),
    actorItem("builthowl0000001", "Marsh Howl", "action", { build: { key: "a:63", owner: "ownbuild00000001" } })
  ];

  assert.deepEqual(coverUpdates(recipe, items, sluggify), [
    { _id: "grantedguard0001", [COVERS]: "f:61" }, { _id: "grantedstep00001", [COVERS]: "a:62" }
  ]);
});

test("an item with a build key never gets a mark, even when it holds another entry by name", () => {
  const recipe = { actions: [{ key: "a:71", name: "Reed Step" }] };
  const items = [actorItem("builtstep0000001", "Reed Step", "action", { build: { key: "f:70", owner: "b" } })];

  assert.deepEqual(coverUpdates(recipe, items, sluggify), []);
});

test("an item stands in for one entry only, and a mark already in place gives no update while a stale one is replaced", () => {
  const recipe = { features: [{ key: "f:81", name: "Steady Guard" }, { key: "f:82", name: "Steady Guard" }] };
  const marked = [actorItem("grantedguard0001", "Steady Guard", "feat", { build: { covers: "f:81" } })];
  const stale = [actorItem("grantedguard0001", "Steady Guard", "feat", { build: { covers: "f:99" } })];

  assert.deepEqual(coverUpdates(recipe, marked, sluggify), []);
  assert.deepEqual(coverUpdates(recipe, stale, sluggify), [{ _id: "grantedguard0001", [COVERS]: "f:81" }]);
});

test("a spell is marked only by a spell in its own entry", () => {
  const recipe = {
    spellcasting: [
      { key: "e:gifts", spells: [{ key: "e:gifts/s:91", name: "Glow Mote" }] },
      { key: "e:book", spells: [{ key: "e:book/s:92", name: "Ember Ward" }] }
    ]
  };
  const items = [
    actorItem("giftsentry000001", "Gifts", "spellcastingEntry", { build: { key: "e:gifts", owner: "b" } }),
    actorItem("bookentry0000001", "Book", "spellcastingEntry", { build: { key: "e:book", owner: "b" } }),
    actorItem("grantedmote00001", "Glow Mote", "spell", { location: "giftsentry000001" }),
    actorItem("grantedward00001", "Ember Ward", "spell", { location: "giftsentry000001" })
  ];

  assert.deepEqual(coverUpdates(recipe, items, sluggify), [{ _id: "grantedmote00001", [COVERS]: "e:gifts/s:91" }]);
});

test("a recipe without lists or an actor without items gives no update", () => {
  assert.deepEqual(coverUpdates({}, [actorItem("grantedguard0001", "Steady Guard", "feat")], sluggify), []);
  assert.deepEqual(coverUpdates({ features: [{ key: "f:1", name: "Steady Guard" }] }, null, sluggify), []);
});

test("a feature marks the feat and an action the action pf2e granted under the same name, whatever their order", () => {
  const recipe = { features: [{ key: "f:95", name: "Reed Strike" }], actions: [{ key: "a:96", name: "Reed Strike" }] };
  const items = [
    actorItem("grantedaction001", "Reed Strike", "action"), actorItem("grantedfeature01", "Reed Strike", "feat")
  ];

  assert.deepEqual(coverUpdates(recipe, items, sluggify), [
    { _id: "grantedfeature01", [COVERS]: "f:95" }, { _id: "grantedaction001", [COVERS]: "a:96" }
  ]);
  assert.deepEqual(coverUpdates({ features: recipe.features }, [items[0]], sluggify), [
    { _id: "grantedaction001", [COVERS]: "f:95" }
  ]);
});
