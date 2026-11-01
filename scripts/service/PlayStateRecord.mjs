import { MODULE_ID } from "../config/ModuleId.mjs";
import { isPlainObject, listOf } from "../util/ObjectLists.mjs";

/** The actor flag (`flags[MODULE].pendingRebuild`) that holds the play state of a rebuild that has not finished. */
export const PENDING_REBUILD_FLAG = "pendingRebuild";

const RECORD_VERSION = 1;

/**
 * The snapshot as plain flag data: maps and sets become `[key, value]` pairs and lists, so no key (a name with a dot,
 * a compendium uuid) is read as a path by Foundry's update.
 */
export function recordedSnapshot(snapshot) {
  return {
    version: RECORD_VERSION,
    built: Boolean(snapshot?.built),
    actor: { ...(snapshot?.actor ?? {}) },
    roots: pairsOf(snapshot?.roots),
    byName: structuredClone(listOf(snapshot?.byName)),
    spellUses: pairsOf(snapshot?.spellUses),
    entries: [...(snapshot?.entries ?? new Map())].map(([ref, slots]) => [ref, recordedSlots(slots)]),
    choices: [...(snapshot?.choices ?? new Map())].map(([sourceId, selections]) => [sourceId, [...selections]]),
    containers: structuredClone(listOf(snapshot?.containers)),
    gearKeys: [...(snapshot?.gearKeys ?? [])]
  };
}

/** The snapshot an unfinished rebuild recorded on the actor, or null when there is none (or it cannot be read). */
export function pendingSnapshot(actorSource) {
  const record = actorSource?.flags?.[MODULE_ID]?.[PENDING_REBUILD_FLAG];
  if (!isPlainObject(record) || record.version !== RECORD_VERSION) return null;
  return {
    built: record.built === true,
    actor: isPlainObject(record.actor) ? { ...record.actor } : {},
    roots: new Map(pairList(record.roots)),
    byName: structuredClone(listOf(record.byName)),
    spellUses: new Map(pairList(record.spellUses)),
    entries: new Map(pairList(record.entries).map(([ref, slots]) => [ref, readSlots(slots)])),
    choices: new Map(pairList(record.choices).map(([sourceId, selections]) => [sourceId, new Set(arrayOf(selections))])),
    containers: structuredClone(listOf(record.containers)),
    gearKeys: arrayOf(record.gearKeys).filter((key) => typeof key === "string")
  };
}

function recordedSlots(slots) {
  return Object.entries(slots ?? {}).map(([slotKey, slot]) => [slotKey, { value: slot?.value, expended: pairsOf(slot?.expended) }]);
}

function readSlots(pairs) {
  const slots = {};
  for (const [slotKey, slot] of arrayOf(pairs).filter(isPair)) {
    slots[slotKey] = { value: slot?.value, expended: new Map(pairList(slot?.expended)) };
  }
  return slots;
}

function pairsOf(map) {
  return structuredClone([...(map ?? new Map())]);
}

function pairList(value) {
  return structuredClone(arrayOf(value).filter(isPair));
}

function isPair(value) {
  return Array.isArray(value) && value.length === 2 && typeof value[0] === "string";
}

function arrayOf(value) {
  return Array.isArray(value) ? value : [];
}
