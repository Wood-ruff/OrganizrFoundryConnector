/** Whether the value is a finite number (not NaN, not ±Infinity, not a numeric string). */
export function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

/** The values rounded down, under the same keys; callers pass finite numbers only. */
export function wholeNumbers(values) {
  const whole = {};
  for (const [key, value] of Object.entries(values)) whole[key] = Math.floor(value);
  return whole;
}

/** Sets `target[key]` to the value rounded down when it is a finite number; otherwise leaves the key out. */
export function addWholeNumber(target, key, value) {
  if (isFiniteNumber(value)) target[key] = Math.floor(value);
}

/** The value rounded down when it is a finite number, else 0. */
export function wholeOrZero(value) {
  return isFiniteNumber(value) ? Math.floor(value) : 0;
}

/** The value kept within `low`…`high`; a `high` below `low` counts as `low`. */
export function clamp(value, low, high) {
  return Math.min(Math.max(value, low), Math.max(low, high));
}
