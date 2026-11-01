import { listOf } from "../util/ObjectLists.mjs";

const CONTAINER_TYPE = "backpack";
const HELD_TYPES = ["weapon", "shield"];
const TWO_HANDS = "held-in-two-hands";
const COINS = [
  { currency: "pp", slug: "platinum-pieces" },
  { currency: "gp", slug: "gold-pieces" },
  { currency: "sp", slug: "silver-pieces" },
  { currency: "cp", slug: "copper-pieces" }
];

/**
 * How the inventory entries with a source are created (by key): `containers` (backpacks holding other entries, outer
 * ones first), `items` (everything else, recipe order), `attached` (entries under a non-backpack entry, created loose)
 * and `parents` (entry key → its backpack's key).
 */
export function gearPlan(inventory, sourcesByKey) {
  const entries = listOf(inventory).filter((entry) => sourceFor(sourcesByKey, entry.key));
  const byKey = new Map(entries.map((entry) => [entry.key, entry]));
  const parents = {};
  const attached = [];
  for (const entry of entries) {
    const holder = byKey.get(entry.container);
    if (!holder || holder === entry) continue;
    if (sourceFor(sourcesByKey, holder.key).type !== CONTAINER_TYPE) attached.push(entry.key);
    else if (!leadsBackTo(holder.key, entry.key, byKey, parents)) parents[entry.key] = holder.key;
  }
  const holders = new Set(Object.values(parents));
  const containers = entries.filter((entry) => holders.has(entry.key)).map((entry) => entry.key);
  const items = entries.filter((entry) => !holders.has(entry.key)).map((entry) => entry.key);
  return { containers: outerFirst(containers, parents), items, attached, parents };
}

/** The keys of every inventory entry the build creates (those with a source), containers first. */
export function gearKeysOf(inventory, sourcesByKey) {
  const gear = gearPlan(inventory, sourcesByKey);
  return [...gear.containers, ...gear.items];
}

/**
 * The carry fields of a gear entry (the inverse of Organizr's equipped rule): stowed in a container, held when equipped
 * and wielded, worn in its slot when equipped otherwise, worn outside its slot when not equipped.
 */
export function carryState(entry, source, containerId = null) {
  const equipped = { ...(source?.system?.equipped ?? {}), ...carryOf(entry, source, containerId) };
  if (entry?.invested) equipped.invested = true;
  return { containerId: containerId ?? null, quantity: quantityOf(entry, source), equipped };
}

/** A copy of the gear source with the entry's carry fields written into `system`. */
export function placedGearSource(source, entry, containerId = null) {
  const placed = structuredClone(source ?? {});
  placed.system = { ...(placed.system ?? {}), ...carryState(entry, source, containerId) };
  return placed;
}

/** One compendium coin item per currency with an amount (`{key, slug, quantity}`); electrum has no pf2e coin item. */
export function coinEntries(coins) {
  const entries = [];
  for (const coin of COINS) {
    const amount = wholeOf(coins?.[coin.currency]);
    if (amount > 0) entries.push({ key: `c:${coin.currency}`, slug: coin.slug, quantity: amount });
  }
  return { entries, electrum: Math.max(0, wholeOf(coins?.ep)) };
}

function carryOf(entry, source, containerId) {
  if (containerId) return { carryType: "stowed" };
  if (!entry?.equipped) return { carryType: "worn", inSlot: false, handsHeld: 0 };
  if (!isWielded(source)) return { carryType: "worn", inSlot: true };
  return { carryType: "held", handsHeld: usageOf(source) === TWO_HANDS ? 2 : 1 };
}

function isWielded(source) {
  return HELD_TYPES.includes(source?.type) || usageOf(source).startsWith("held");
}

function usageOf(source) {
  const usage = source?.system?.usage?.value;
  return typeof usage === "string" ? usage : "";
}

function quantityOf(entry, source) {
  if (Number.isFinite(entry?.quantity)) return Math.max(0, Math.trunc(entry.quantity));
  return wholeOf(source?.system?.quantity);
}

function leadsBackTo(startKey, entryKey, byKey, parents) {
  const visited = new Set();
  let key = startKey;
  while (key !== undefined && !visited.has(key)) {
    if (key === entryKey) return true;
    visited.add(key);
    key = parents[key];
  }
  return false;
}

function outerFirst(containers, parents) {
  return [...containers].sort((first, second) => depthOf(first, parents) - depthOf(second, parents));
}

function depthOf(key, parents) {
  let depth = 0;
  let parent = parents[key];
  while (parent !== undefined && depth <= Object.keys(parents).length) {
    depth += 1;
    parent = parents[parent];
  }
  return depth;
}

function sourceFor(sourcesByKey, key) {
  if (sourcesByKey instanceof Map) return sourcesByKey.get(key) ?? null;
  return sourcesByKey?.[key] ?? null;
}

function wholeOf(value) {
  return Number.isFinite(value) ? Math.trunc(value) : 0;
}
