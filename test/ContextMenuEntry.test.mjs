import { test } from "node:test";
import assert from "node:assert/strict";
import { contextMenuEntry, directoryEntryId, isWorldDirectory } from "../scripts/util/ContextMenuEntry.mjs";

function recordingSpec() {
  const calls = [];
  return {
    calls,
    spec: {
      label: "ORGANIZR.Send.Action",
      icon: "fa-solid fa-cloud-arrow-up",
      isVisible: (li) => li.dataset.entryId === "visible000000001",
      run: (li) => calls.push(li.dataset.entryId)
    }
  };
}

test("V14 entries use label, visible and onClick(event, li)", () => {
  const { calls, spec } = recordingSpec();
  const entry = contextMenuEntry(14, spec);
  assert.deepEqual(Object.keys(entry).sort(), ["icon", "label", "onClick", "visible"]);
  assert.equal(entry.label, "ORGANIZR.Send.Action");
  assert.equal(entry.icon, "fa-solid fa-cloud-arrow-up");
  assert.equal(entry.visible({ dataset: { entryId: "visible000000001" } }), true);
  assert.equal(entry.visible({ dataset: { entryId: "hidden0000000001" } }), false);
  entry.onClick({ type: "click" }, { dataset: { entryId: "visible000000001" } });
  assert.deepEqual(calls, ["visible000000001"]);
});

test("V13 entries use name, an icon element, condition and callback(li)", () => {
  const { calls, spec } = recordingSpec();
  const entry = contextMenuEntry(13, spec);
  assert.deepEqual(Object.keys(entry).sort(), ["callback", "condition", "icon", "name"]);
  assert.equal(entry.name, "ORGANIZR.Send.Action");
  assert.equal(entry.icon, '<i class="fa-solid fa-cloud-arrow-up"></i>');
  assert.equal(entry.condition({ dataset: { entryId: "visible000000001" } }), true);
  assert.equal(entry.condition({ dataset: { entryId: "hidden0000000001" } }), false);
  entry.callback({ dataset: { entryId: "visible000000001" } });
  assert.deepEqual(calls, ["visible000000001"]);
});

test("later generations keep the V14 shape", () => {
  const { spec } = recordingSpec();
  assert.equal("onClick" in contextMenuEntry(15, spec), true);
});

test("the entry id comes from the list element's data-entry-id", () => {
  assert.equal(directoryEntryId({ dataset: { entryId: "actor00000000001" } }), "actor00000000001");
  assert.equal(directoryEntryId({ dataset: {} }), null);
  assert.equal(directoryEntryId(null), null);
});

test("conn-4 only the world directory of the collection counts, not a compendium window", () => {
  const worldActors = { documentName: "Actor" };
  const compendium = { documentName: "Actor", metadata: { id: "world.reed-npcs" } };
  assert.equal(isWorldDirectory({ collection: worldActors }, worldActors), true);
  assert.equal(isWorldDirectory({ collection: compendium }, worldActors), false);
  assert.equal(isWorldDirectory({}, worldActors), false);
  assert.equal(isWorldDirectory(undefined, worldActors), false);
});
