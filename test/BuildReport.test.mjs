import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyReport, hasFindings, reportToast, reportView } from "../scripts/service/BuildReport.mjs";

function reportWith(changes, updated = false) {
  return { ...emptyReport("Tessa Quillmoor", updated), ...changes };
}

test("an empty report has every list empty and no findings", () => {
  const report = emptyReport("Tessa Quillmoor", false);
  assert.deepEqual(report, {
    name: "Tessa Quillmoor", updated: false, missing: [], ambiguous: [], custom: [], unslotted: [], attached: [],
    defaulted: [], unanswered: [], manualAttributes: null, unspentBoosts: 0, differences: [], notes: []
  });
  assert.equal(hasFindings(report), false);
  assert.equal(hasFindings(null), false);
});

test("every list, the manual reason and unspent boosts count as findings", () => {
  const changes = [
    { missing: [{ list: "features", name: "Quick Step" }] },
    { ambiguous: [{ list: "features", name: "Hold The Line", count: 2 }] },
    { custom: [{ list: "inventory", name: "Cinder Blade" }] },
    { unslotted: ["Bonus Knack"] },
    { attached: ["Brass Lantern"] },
    { defaulted: [{ item: "Weapon Drill", choice: "Axe" }] },
    { unanswered: [{ item: "Hidden Talent" }] },
    { differences: [{ key: "ac", organizr: 19, foundry: 22 }] },
    { notes: ["2 hidden entries were left out."] },
    { manualAttributes: "unreachable" },
    { manualAttributes: "gradual" },
    { unspentBoosts: 2 }
  ];
  for (const change of changes) assert.equal(hasFindings(reportWith(change)), true, JSON.stringify(change));
  assert.equal(hasFindings(reportWith({ unspentBoosts: 0 })), false);
});

test("without findings the toast says built or rebuilt", () => {
  assert.deepEqual(reportToast(emptyReport("Tessa Quillmoor", false)),
    { key: "ORGANIZR.Build.Built", data: { name: "Tessa Quillmoor" } });
  assert.deepEqual(reportToast(emptyReport("Tessa Quillmoor", true)),
    { key: "ORGANIZR.Build.Rebuilt", data: { name: "Tessa Quillmoor" } });
});

test("with findings the toast counts them", () => {
  const report = reportWith({
    missing: [{ list: "features", name: "Quick Step" }],
    ambiguous: [{ list: "features", name: "Hold The Line", count: 2 }],
    custom: [{ list: "inventory", name: "Cinder Blade" }],
    attached: ["Brass Lantern"],
    defaulted: [{ item: "Weapon Drill", choice: "Axe" }],
    unanswered: [{ item: "Hidden Talent" }],
    differences: [{ key: "ac", organizr: 19, foundry: 22 }],
    manualAttributes: "unreachable",
    unspentBoosts: 4
  }, true);
  assert.deepEqual(reportToast(report), {
    key: "ORGANIZR.Build.Findings",
    data: { name: "Tessa Quillmoor", missing: 2, custom: 1, choices: 2, differences: 1, findings: 9 }
  });
});

test("the view lists only non-empty groups in card order with their title keys", () => {
  const report = reportWith({
    notes: ["2 hidden entries were left out."],
    differences: [{ key: "skills.athletics", organizr: 13, foundry: 14 }, { key: "strikes.Fist.attack", organizr: 13,
      foundry: 12 }],
    unspentBoosts: 2,
    manualAttributes: "gradual",
    unanswered: [{ item: "Hidden Talent" }],
    defaulted: [{ item: "Weapon Drill", choice: "Axe" }],
    attached: ["Brass Lantern"],
    unslotted: ["Bonus Knack"],
    custom: [{ list: "inventory", name: "Cinder Blade" }],
    ambiguous: [{ list: "features", name: "Hold The Line", count: 2 }],
    missing: [{ list: "identity", name: "Invented Heritage" }, { list: "coins", name: "ep" }]
  });
  const labels = {
    lists: { identity: "Identity", features: "Features", inventory: "Inventory" },
    difference: (key) => (key === "skills.athletics" ? "Athletics" : null)
  };
  const view = reportView(report, labels);
  assert.equal(view.name, "Tessa Quillmoor");
  assert.equal(view.updated, false);
  assert.deepEqual(view.groups.map((group) => [group.id, group.titleKey]), [
    ["missing", "ORGANIZR.Build.Card.Missing"],
    ["ambiguous", "ORGANIZR.Build.Card.Ambiguous"],
    ["custom", "ORGANIZR.Build.Card.Custom"],
    ["unslotted", "ORGANIZR.Build.Card.Unslotted"],
    ["attached", "ORGANIZR.Build.Card.Attached"],
    ["defaulted", "ORGANIZR.Build.Card.Defaulted"],
    ["unanswered", "ORGANIZR.Build.Card.Unanswered"],
    ["manual", "ORGANIZR.Build.Card.Manual"],
    ["unspentBoosts", "ORGANIZR.Build.Card.UnspentBoosts"],
    ["differences", "ORGANIZR.Build.Card.Differences"],
    ["notes", "ORGANIZR.Build.Card.Notes"]
  ]);
  const byId = Object.fromEntries(view.groups.map((group) => [group.id, group]));
  assert.deepEqual(byId.missing.rows, [{ label: "Identity", text: "Invented Heritage" }, { label: "coins", text: "ep" }]);
  assert.deepEqual(byId.missing.titleData, { count: 2 });
  assert.deepEqual(byId.ambiguous.rows, [{ label: "Features", text: "Hold The Line", count: 2 }]);
  assert.deepEqual(byId.defaulted.rows, [{ label: "Weapon Drill", text: "Axe" }]);
  assert.deepEqual(byId.unanswered.rows, [{ label: "Hidden Talent", text: "" }]);
  assert.deepEqual(byId.attached.rows, [{ label: "", text: "Brass Lantern" }]);
  assert.deepEqual(byId.manual.titleData, { reason: "gradual" });
  assert.deepEqual(byId.unspentBoosts.titleData, { count: 2 });
  assert.deepEqual(byId.differences.rows, [
    { label: "Athletics", text: "14 / 13" },
    { label: "strikes.Fist.attack", text: "12 / 13" }
  ]);
  assert.deepEqual(byId.notes.rows, [{ label: "", text: "2 hidden entries were left out." }]);
});

test("a report without findings has no view groups", () => {
  assert.deepEqual(reportView(emptyReport("Tessa Quillmoor", true)).groups, []);
});
