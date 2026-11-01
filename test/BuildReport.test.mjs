import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { emptyReport, filledReport, hasFindings, reportToast, reportView } from "../scripts/service/BuildReport.mjs";

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
  }, false);
  assert.deepEqual(reportToast(report), {
    key: "ORGANIZR.Build.Findings",
    data: { name: "Tessa Quillmoor", missing: 2, custom: 1, choices: 2, differences: 1, findings: 9 }
  });
});

test("a rebuild with findings says rebuilt and counts them the same way", () => {
  const changes = { custom: [{ list: "inventory", name: "Cinder Blade" }], differences: [{ key: "ac", organizr: 19, foundry: 22 }] };
  const counts = { name: "Tessa Quillmoor", missing: 0, custom: 1, choices: 0, differences: 1, findings: 2 };
  assert.deepEqual(reportToast(reportWith(changes, true)), { key: "ORGANIZR.Build.RebuiltFindings", data: counts });
  assert.deepEqual(reportToast(reportWith(changes, false)), { key: "ORGANIZR.Build.Findings", data: counts });
});

test("a single finding takes the singular built or rebuilt key", () => {
  const changes = { differences: [{ key: "ac", organizr: 19, foundry: 22 }] };
  const counts = { name: "Tessa Quillmoor", missing: 0, custom: 0, choices: 0, differences: 1, findings: 1 };
  assert.deepEqual(reportToast(reportWith(changes, true)), { key: "ORGANIZR.Build.RebuiltFinding", data: counts });
  assert.deepEqual(reportToast(reportWith(changes, false)), { key: "ORGANIZR.Build.Finding", data: counts });
});

test("the built and rebuilt findings texts exist with the same placeholders", () => {
  const texts = JSON.parse(readFileSync(new URL("../lang/en.json", import.meta.url), "utf8")).ORGANIZR.Build;
  const placeholders = (text) => text.match(/\{\w+\}/g).sort();
  assert.match(texts.Findings, /was built with \{findings\} findings/);
  assert.match(texts.RebuiltFindings, /was rebuilt with \{findings\} findings/);
  assert.match(texts.Finding, /was built with 1 finding /);
  assert.match(texts.RebuiltFinding, /was rebuilt with 1 finding /);
  assert.deepEqual(placeholders(texts.RebuiltFindings), placeholders(texts.Findings));
  assert.deepEqual(placeholders(texts.RebuiltFinding), placeholders(texts.Finding));
});

test("the findings texts give each part's count after its label, so a count of 1 reads right", () => {
  const texts = JSON.parse(readFileSync(new URL("../lang/en.json", import.meta.url), "utf8")).ORGANIZR.Build;
  for (const key of ["Finding", "RebuiltFinding", "Findings", "RebuiltFindings"]) {
    for (const part of ["missing", "custom", "choices", "differences"]) {
      assert.match(texts[key], new RegExp(`: \\{${part}\\}[,)]`), `${key} ${part}`);
    }
    assert.match(texts[key], /numbers differing: \{differences\}/);
  }
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

test("a filled report takes every part, unknown languages as missing and the prompts' choices", () => {
  const report = filledReport("Tessa Quillmoor", false, {
    findings: {
      missing: [{ list: "features", name: "Lost Talent" }],
      ambiguous: [{ list: "features", name: "Twin Echo", count: 2 }],
      custom: [{ list: "inventory", name: "Cinder Blade" }]
    },
    unknownLanguages: ["Old Tidecant"],
    unslotted: ["Bonus Knack"],
    attached: ["Brass Lantern"],
    prompts: [
      { item: "Weapon Drill", choice: "Axe", how: "default" },
      { item: "Scholar", choice: "Occultism", how: "suffix" },
      { item: "Hidden Talent", choice: null, how: null }
    ],
    itemSources: [{ name: "Quiet Gift", system: { rules: [{ key: "ChoiceSet", ignored: true }] } }],
    manualAttributes: "unreachable",
    unspentBoosts: 2,
    differences: [{ key: "ac", organizr: 19, foundry: 22 }],
    notes: ["2 hidden entries were left out."]
  });
  assert.deepEqual(report.missing, [{ list: "features", name: "Lost Talent" }, { list: "languages", name: "Old Tidecant" }]);
  assert.deepEqual(report.ambiguous, [{ list: "features", name: "Twin Echo", count: 2 }]);
  assert.deepEqual(report.custom, [{ list: "inventory", name: "Cinder Blade" }]);
  assert.deepEqual(report.unslotted, ["Bonus Knack"]);
  assert.deepEqual(report.attached, ["Brass Lantern"]);
  assert.deepEqual(report.defaulted, [{ item: "Weapon Drill", choice: "Axe" }]);
  assert.deepEqual(report.unanswered, [{ item: "Hidden Talent" }, { item: "Quiet Gift" }]);
  assert.equal(report.manualAttributes, "unreachable");
  assert.equal(report.unspentBoosts, 2);
  assert.deepEqual(report.differences, [{ key: "ac", organizr: 19, foundry: 22 }]);
  assert.deepEqual(report.notes, ["2 hidden entries were left out."]);
  assert.equal(report.updated, false);
});

test("a filled report without parts is empty and has no findings", () => {
  const report = filledReport("Tessa Quillmoor", true, {});
  assert.deepEqual(report, emptyReport("Tessa Quillmoor", true));
  assert.equal(hasFindings(filledReport("Tessa Quillmoor", false, { unspentBoosts: -1 })), false);
});
