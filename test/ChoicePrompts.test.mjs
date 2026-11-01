import { test } from "node:test";
import assert from "node:assert/strict";
import { isChoicePrompt, promptView, withChoicePrompts } from "../scripts/entry/ChoicePrompts.mjs";
import { sluggify } from "./support/sluggify.mjs";

function fakeHooks() {
  const handlers = new Map();
  let nextId = 1;
  return {
    on(hook, fn) {
      const id = nextId++;
      handlers.set(id, { hook, fn });
      return id;
    },
    off(hook, id) {
      if (handlers.get(id)?.hook === hook) handlers.delete(id);
    },
    callAll(hook, ...args) {
      for (const handler of [...handlers.values()]) {
        if (handler.hook === hook) handler.fn(...args);
      }
    },
    count() {
      return handlers.size;
    }
  };
}

function installFoundry() {
  const hooks = fakeHooks();
  globalThis.Hooks = hooks;
  globalThis.game = {
    i18n: { localize: (key) => (key === "LANG.Blade" ? "Blade" : key) },
    pf2e: { system: { sluggify } }
  };
  return hooks;
}

function fakePrompt(itemName, choices, sourceId = null) {
  return {
    item: { name: itemName, sourceId },
    choices,
    selection: null,
    closed: 0,
    close() {
      this.closed += 1;
    }
  };
}

function evidence(overrides = {}) {
  return {
    suffixes: new Map(),
    names: new Set(),
    levels: new Map(),
    uncovered: new Set(),
    skillRanks: new Map(),
    previous: new Map(),
    ...overrides
  };
}

test("a prompt that opens while the build runs is answered from the evidence, closed and recorded", async () => {
  const hooks = installFoundry();
  const outcome = {};
  const prompt = fakePrompt("Weapon Drill (Blade)", [{ value: "axe", label: "Axe" }, { value: "blade", label: "LANG.Blade" }]);
  const facts = evidence({ suffixes: new Map([["weapon-drill", new Set(["blade"])]]) });

  const result = await withChoicePrompts(facts, outcome, async () => {
    hooks.callAll("renderPickAThingPrompt", prompt);
    return "built";
  });

  assert.equal(result, "built");
  assert.deepEqual(prompt.selection, { value: "blade", label: "LANG.Blade" });
  assert.equal(prompt.closed, 1);
  assert.deepEqual(outcome.prompts, [{ item: "Weapon Drill (Blade)", choice: "Blade", how: "suffix" }]);
});

test("without evidence the first choice is picked and recorded as default", async () => {
  const hooks = installFoundry();
  const outcome = { prompts: [{ item: "Earlier", choice: "X", how: "name" }] };
  const prompt = fakePrompt("Odd Training", [{ value: "a", label: "First" }, { value: "b", label: "Second" }]);

  await withChoicePrompts(evidence(), outcome, async () => hooks.callAll("renderPickAThingPrompt", prompt));

  assert.equal(prompt.selection.value, "a");
  assert.deepEqual(outcome.prompts[1], { item: "Odd Training", choice: "First", how: "default" });
});

test("a prompt without choices closes with no selection and is recorded as unanswered", async () => {
  const hooks = installFoundry();
  const outcome = {};
  const prompt = fakePrompt("Empty Gift", []);
  prompt.selection = { value: "stale" };

  await withChoicePrompts(evidence(), outcome, async () => hooks.callAll("renderPickAThingPrompt", prompt));

  assert.equal(prompt.selection, null);
  assert.equal(prompt.closed, 1);
  assert.deepEqual(outcome.prompts, [{ item: "Empty Gift", choice: null, how: null }]);
});

test("the previous selection of the same source wins", async () => {
  const hooks = installFoundry();
  const outcome = {};
  const sourceId = "Compendium.example.Item.abc";
  const prompt = fakePrompt("Gift of Paths", [{ value: "left", label: "Left" }, { value: "right", label: "Right" }], sourceId);
  const facts = evidence({ previous: new Map([[sourceId, new Set(["right"])]]) });

  await withChoicePrompts(facts, outcome, async () => hooks.callAll("renderPickAThingPrompt", prompt));

  assert.equal(prompt.selection.value, "right");
  assert.equal(outcome.prompts[0].how, "previous");
});

test("the fallback hook catches prompts and each prompt is answered once even when both hooks fire", async () => {
  const hooks = installFoundry();
  const outcome = {};
  const prompt = fakePrompt("Twin Call", [{ value: "a", label: "A" }]);
  const window = { choices: "not a list", selection: null, close() { throw new Error("must not close"); } };

  await withChoicePrompts(evidence(), outcome, async () => {
    hooks.callAll("renderPickAThingPrompt", prompt);
    hooks.callAll("renderApplicationV2", prompt);
    hooks.callAll("renderApplicationV2", prompt);
    hooks.callAll("renderApplicationV2", window);
  });

  assert.equal(prompt.closed, 1);
  assert.equal(outcome.prompts.length, 1);
});

test("the hooks are removed afterwards, also when the build throws", async () => {
  const hooks = installFoundry();
  const outcome = {};
  await assert.rejects(withChoicePrompts(evidence(), outcome, async () => {
    assert.equal(hooks.count(), 2);
    throw new Error("build failed");
  }), /build failed/);
  assert.equal(hooks.count(), 0);

  const late = fakePrompt("Late", [{ value: "a", label: "A" }]);
  hooks.callAll("renderPickAThingPrompt", late);
  assert.equal(late.closed, 0);
  assert.deepEqual(outcome.prompts, []);
});

test("a failing answer still closes the prompt, unanswered", async () => {
  const hooks = installFoundry();
  game.pf2e.system.sluggify = () => {
    throw new Error("broken");
  };
  const outcome = {};
  const prompt = fakePrompt("Fragile Choice", [{ value: "a", label: "A" }]);
  const warn = console.warn;
  console.warn = () => {};
  try {
    await withChoicePrompts(evidence(), outcome, async () => hooks.callAll("renderPickAThingPrompt", prompt));
  } finally {
    console.warn = warn;
  }
  assert.equal(prompt.selection, null);
  assert.equal(prompt.closed, 1);
  assert.deepEqual(outcome.prompts, [{ item: "Fragile Choice", choice: null, how: null }]);
});

test("isChoicePrompt needs a choice list and a selection field", () => {
  assert.equal(isChoicePrompt({ choices: [], selection: null }), true);
  assert.equal(isChoicePrompt({ choices: [] }), false);
  assert.equal(isChoicePrompt({ selection: null }), false);
  assert.equal(isChoicePrompt(null), false);
  assert.equal(isChoicePrompt(undefined), false);
});

test("promptView localizes labels and tolerates a missing item", () => {
  const view = promptView({ choices: [{ value: 1, label: "KEY" }, { value: 2 }] }, (label) => `<${label}>`);
  assert.deepEqual(view, { itemName: "", sourceId: null, choices: [{ value: 1, label: "<KEY>" }, { value: 2, label: "<>" }] });
});
