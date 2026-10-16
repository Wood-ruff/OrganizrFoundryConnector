import { test } from "node:test";
import assert from "node:assert/strict";
import { characterExport, exportFileName } from "../scripts/service/CharacterExport.mjs";

const world = { id: "my-world", coreVersion: "14.369", systemId: "pf2e", systemVersion: "8.6.0" };

function actor(compendiumData) {
  return {
    id: "Ab12Cd34Ef56Gh78",
    uuid: "Actor.Ab12Cd34Ef56Gh78",
    name: "Mara Thistlewood",
    documentName: "Actor",
    toCompendium: (pack, options) => {
      assert.equal(pack, null);
      assert.deepEqual(options, {});
      return structuredClone(compendiumData);
    }
  };
}

test("export is the compendium data plus _stats.exportSource like Foundry's Export Data", () => {
  const data = characterExport(actor({
    name: "Mara Thistlewood", type: "character", system: { details: {} }, items: [],
    _stats: { compendiumSource: null, coreVersion: "14.369", systemId: "pf2e", systemVersion: "8.6.0" }
  }), world);

  assert.equal(data.name, "Mara Thistlewood");
  assert.equal(data._stats.coreVersion, "14.369");
  assert.deepEqual(data._stats.exportSource, {
    worldId: "my-world",
    uuid: "Actor.Ab12Cd34Ef56Gh78",
    coreVersion: "14.369",
    systemId: "pf2e",
    systemVersion: "8.6.0"
  });
});

test("a missing _stats block is created", () => {
  const data = characterExport(actor({ name: "X", type: "character" }), world);
  assert.equal(data._stats.exportSource.systemId, "pf2e");
});

test("file name follows Foundry's fvtt-<Document>-<slug>-<id>.json pattern", () => {
  assert.equal(exportFileName(actor({})), "fvtt-Actor-mara-thistlewood-Ab12Cd34Ef56Gh78.json");
  assert.equal(exportFileName({ ...actor({}), name: "Señor  Ünïcode!" }), "fvtt-Actor-senor-unicode-Ab12Cd34Ef56Gh78.json");
});
