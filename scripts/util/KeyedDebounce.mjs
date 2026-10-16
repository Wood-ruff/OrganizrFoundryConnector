/**
 * Debounces `fn` separately per key: repeated calls with the same key within `delayMs`
 * collapse into one call with the latest arguments. `cancelAll()` drops everything pending.
 */
export function createKeyedDebounce(fn, delayMs) {
  const timers = new Map();

  function call(key, ...args) {
    clearTimeout(timers.get(key));
    timers.set(key, setTimeout(() => {
      timers.delete(key);
      fn(...args);
    }, delayMs));
  }

  function cancelAll() {
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
  }

  return { call, cancelAll, pending: () => timers.size };
}
