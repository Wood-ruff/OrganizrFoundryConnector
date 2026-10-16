import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { createKeyedDebounce } from "../scripts/util/KeyedDebounce.mjs";

test("calls with the same key within the delay collapse into the last one", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  const calls = [];
  const debounce = createKeyedDebounce((...args) => calls.push(args), 500);

  debounce.call("a", 1);
  debounce.call("a", 2);
  debounce.call("b", 3);
  assert.equal(debounce.pending(), 2);
  mock.timers.tick(499);
  assert.deepEqual(calls, []);
  mock.timers.tick(1);
  assert.deepEqual(calls, [[2], [3]]);
  assert.equal(debounce.pending(), 0);
  mock.timers.reset();
});

test("cancelAll drops pending calls", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  const calls = [];
  const debounce = createKeyedDebounce((...args) => calls.push(args), 100);
  debounce.call("a", 1);
  debounce.cancelAll();
  mock.timers.tick(200);
  assert.deepEqual(calls, []);
  assert.equal(debounce.pending(), 0);
  mock.timers.reset();
});
