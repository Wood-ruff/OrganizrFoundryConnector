import { test } from "node:test";
import assert from "node:assert/strict";
import { createImageCache } from "../scripts/service/ImageCache.mjs";

function deferredLoader() {
  const waiting = new Map();
  const load = (fileId) => new Promise((resolve, reject) => waiting.set(fileId, { resolve, reject }));
  return { load, waiting, finish: (id) => waiting.get(id).resolve(`blob:${id}`), fail: (id) => waiting.get(id).reject(new Error("x")) };
}

function cacheWith(loader, revoked = [], concurrency = 2) {
  return createImageCache({
    load: loader.load,
    createUrl: (blob) => `url:${blob}`,
    revokeUrl: (url) => revoked.push(url),
    concurrency
  });
}

test("loads at most `concurrency` files at a time and resolves each url", async () => {
  const loader = deferredLoader();
  const cache = cacheWith(loader);
  const first = cache.urlFor("a");
  const second = cache.urlFor("b");
  const third = cache.urlFor("c");
  assert.deepEqual([...loader.waiting.keys()], ["a", "b"]);

  loader.finish("a");
  assert.equal(await first, "url:blob:a");
  assert.deepEqual([...loader.waiting.keys()], ["a", "b", "c"]);

  loader.finish("b");
  loader.finish("c");
  assert.equal(await second, "url:blob:b");
  assert.equal(await third, "url:blob:c");
});

test("a file is loaded once; later calls and cached() reuse the url", async () => {
  const loader = deferredLoader();
  const cache = cacheWith(loader);
  const one = cache.urlFor("a");
  const two = cache.urlFor("a");
  assert.equal(one, two);
  assert.equal(cache.cached("a"), null);
  loader.finish("a");
  await one;
  assert.equal(cache.cached("a"), "url:blob:a");
  assert.equal(await cache.urlFor("a"), "url:blob:a");
  assert.equal(loader.waiting.size, 1);
});

test("a failed load resolves to null and is not retried", async () => {
  const loader = deferredLoader();
  const cache = cacheWith(loader);
  const promise = cache.urlFor("a");
  loader.fail("a");
  assert.equal(await promise, null);
  assert.equal(await cache.urlFor("a"), null);
  assert.equal(loader.waiting.size, 1);
});

test("release revokes every url, including loads that finish afterwards", async () => {
  const loader = deferredLoader();
  const revoked = [];
  const cache = cacheWith(loader, revoked);
  const done = cache.urlFor("a");
  const late = cache.urlFor("b");
  loader.finish("a");
  await done;

  cache.release();
  assert.deepEqual(revoked, ["url:blob:a"]);
  assert.equal(cache.cached("a"), null);

  loader.finish("b");
  assert.equal(await late, null);
  assert.deepEqual(revoked, ["url:blob:a", "url:blob:b"]);
});
