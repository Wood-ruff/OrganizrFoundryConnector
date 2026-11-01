/** Whether the value is a non-null object that is not an array. */
export function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** The plain-object entries of a list; anything that is not an array gives []. */
export function listOf(value) {
  return Array.isArray(value) ? value.filter(isPlainObject) : [];
}

/** The updates merged into one per `_id`, in first-seen order; a later update's fields win over an earlier one's. */
export function mergedById(updates) {
  const merged = new Map();
  for (const update of listOf(updates)) {
    const current = merged.get(update._id) ?? {};
    merged.set(update._id, { ...current, ...update });
  }
  return [...merged.values()];
}
