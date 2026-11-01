import { test } from "node:test";
import assert from "node:assert/strict";
import { createSerialQueue } from "../scripts/util/SerialQueue.mjs";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

test("a task starts only after the one before it finished, in call order", async () => {
  const queue = createSerialQueue();
  const events = [];
  const first = deferred();
  const firstRun = queue.run(async () => {
    events.push("first started");
    await first.promise;
    events.push("first done");
    return "one";
  });
  const secondRun = queue.run(async () => {
    events.push("second started");
    return "two";
  });
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(events, ["first started"]);
  first.resolve();
  assert.deepEqual(await Promise.all([firstRun, secondRun]), ["one", "two"]);
  assert.deepEqual(events, ["first started", "first done", "second started"]);
});

test("a failed task rejects its own call and the next task still runs", async () => {
  const queue = createSerialQueue();
  const failing = queue.run(async () => {
    throw new Error("build failed");
  });
  const next = queue.run(async () => "next");
  await assert.rejects(failing, /build failed/);
  assert.equal(await next, "next");
});

test("a task that throws before returning a promise is a rejection, not a stuck queue", async () => {
  const queue = createSerialQueue();
  const failing = queue.run(() => {
    throw new Error("sync failure");
  });
  await assert.rejects(failing, /sync failure/);
  assert.equal(await queue.run(() => "after"), "after");
});
