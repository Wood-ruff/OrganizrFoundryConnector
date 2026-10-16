/**
 * Loads images on demand through `load(fileId) -> Blob`, at most `concurrency` at a time,
 * and keeps one object URL per file until `release()`. A failed load is remembered as null.
 */
export function createImageCache({ load, createUrl, revokeUrl, concurrency = 3 }) {
  const urls = new Map();
  const pending = new Map();
  const queue = [];
  let running = 0;
  let released = false;

  function urlFor(fileId) {
    if (urls.has(fileId)) return Promise.resolve(urls.get(fileId));
    if (pending.has(fileId)) return pending.get(fileId);
    const promise = new Promise((resolve) => queue.push({ fileId, resolve }));
    pending.set(fileId, promise);
    pump();
    return promise;
  }

  function pump() {
    while (running < concurrency && queue.length) {
      running += 1;
      run(queue.shift());
    }
  }

  async function run({ fileId, resolve }) {
    const url = await loadUrl(fileId);
    running -= 1;
    pending.delete(fileId);
    resolve(remember(fileId, url));
    pump();
  }

  async function loadUrl(fileId) {
    try {
      return createUrl(await load(fileId));
    } catch {
      return null;
    }
  }

  function remember(fileId, url) {
    if (released) {
      if (url) revokeUrl(url);
      return null;
    }
    urls.set(fileId, url);
    return url;
  }

  function cached(fileId) {
    return urls.get(fileId) ?? null;
  }

  function release() {
    released = true;
    for (const url of urls.values()) if (url) revokeUrl(url);
    urls.clear();
    pending.clear();
    queue.length = 0;
  }

  return { urlFor, cached, release };
}
