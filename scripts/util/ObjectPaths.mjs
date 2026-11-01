/** The value under a dotted path ("attributes.hp.temp"), or undefined when a step is missing. */
export function valueAt(source, path) {
  let value = source;
  for (const key of path.split(".")) {
    if (value === null || typeof value !== "object") return undefined;
    value = value[key];
  }
  return value;
}

/** Writes a copy of the value under a dotted path, creating the objects on the way (replacing non-objects). */
export function setAt(target, path, value) {
  const keys = path.split(".");
  const lastKey = keys.pop();
  let parent = target;
  for (const key of keys) {
    if (parent[key] === null || typeof parent[key] !== "object") parent[key] = {};
    parent = parent[key];
  }
  parent[lastKey] = structuredClone(value);
}

/** Copies the value under a dotted path from source to target when the source holds one (not undefined). */
export function copyPathFrom(target, source, path) {
  const value = valueAt(source, path);
  if (value !== undefined) setAt(target, path, value);
}
