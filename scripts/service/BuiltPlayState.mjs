import { MODULE_ID } from "../config/ModuleId.mjs";
import { currentItemMatcher } from "../util/ItemMatch.mjs";
import { clamp, isFiniteNumber } from "../util/WholeNumbers.mjs";
import { buildKeyOf } from "./Pf2eItemSources.mjs";
import { listOf, mergedById } from "../util/ObjectLists.mjs";
import { PHYSICAL_TYPES } from "./Pf2eItemTypes.mjs";
import { isBuiltActor, ownRoots, rootIdsToDelete } from "./BuiltRoots.mjs";

const ENTRY_TYPE = "spellcastingEntry";
const SPELL_TYPE = "spell";
const CHOICE_SET = "ChoiceSet";

/**
 * The play state of a pf2e actor before it is rebuilt from Organizr: HP, temp HP, hero and focus points; per own build
 * key the root `_id` and the quantity, uses, HP and container of physical items; innate spell uses and spell slot values
 * with the expended preparations per spell; the ChoiceSet selections per compendium source (`choices`, only sources one
 * item holds); the kept items inside a root that will be deleted (`containers`) and the gear keys the build created
 * (`gearKeys`). An actor the connector did not build keeps its item values by type and name (`byName`), its entries and
 * spells by name, and no ids. `keepCoins` is passed on to `rootIdsToDelete`.
 */
export function snapshotPlayState(actorSource, { keepCoins = false } = {}) {
  const items = itemsOf(actorSource);
  const built = isBuiltActor(actorSource);
  const deleted = new Set(rootIdsToDelete(actorSource, { keepCoins }));
  const roots = rootStates(actorSource);
  const stateItems = items.filter((item) => isStateHolder(roots, built, item));
  return {
    built,
    actor: actorValues(actorSource?.system),
    roots,
    byName: built ? [] : namedStates(items),
    spellUses: spellUses(stateItems, built),
    entries: entryStates(stateItems, built),
    choices: choiceSelections(items),
    containers: keptContents(items, deleted),
    gearKeys: builtGearKeys(actorSource)
  };
}

/**
 * Whether the build made this gear key before and its item is gone (used up, sold or given away in Foundry), so a
 * refresh that keeps the inventory does not bring it back.
 */
export function isUsedUp(snapshot, key) {
  const gearKeys = snapshot?.gearKeys ?? [];
  const hasRoot = snapshot?.roots?.has(key) ?? false;
  return gearKeys.includes(key) && !hasRoot;
}

/**
 * Every item update that restores the kept play state after the writes, one per item: kept contents and roots back in
 * their containers, the kept item values (not with `restoreInventory`), innate spell uses and slot values.
 */
export function playStateItemUpdates(snapshot, itemSources, restoreInventory) {
  const sources = listOf(itemSources);
  const updates = [
    ...containerRestores(snapshot, sources.map((source) => source._id)),
    ...rootContainerRestores(snapshot, sources),
    ...(restoreInventory ? [] : itemStateUpdates(snapshot, sources)),
    ...spellUseUpdates(snapshot, sources),
    ...entrySlotUpdates(snapshot, sources)
  ];
  return mergedById(updates);
}

/** The `_id` the root of this build key had before the rebuild, or null (new key, or an actor the connector did not build). */
export function keptRootId(snapshot, key) {
  return snapshot?.roots?.get(key)?.id ?? null;
}

/** The updates that put kept items still present back into their recreated containers (`[{_id, "system.containerId"}]`). */
export function containerRestores(snapshot, presentIds) {
  const present = new Set(presentIds ?? []);
  return listOf(snapshot?.containers)
    .filter((content) => present.has(content.containerId) && present.has(content.id))
    .map((content) => ({ _id: content.id, "system.containerId": content.containerId }));
}

/**
 * The updates that put rebuilt roots the recipe leaves loose back into the Foundry container they were in (a kept
 * item, not one of the build's own roots), when that container is still there.
 */
export function rootContainerRestores(snapshot, itemSources) {
  const sources = listOf(itemSources);
  const present = new Set(sources.map((source) => source._id));
  const rootIds = new Set([...(snapshot?.roots?.values() ?? [])].map((root) => root.id));
  const updates = [];
  for (const source of sources.filter((candidate) => PHYSICAL_TYPES.includes(candidate.type))) {
    const containerId = recreatedRootState(snapshot, source)?.containerId;
    if (!present.has(containerId) || rootIds.has(containerId) || source.system?.containerId) continue;
    updates.push({ _id: source._id, "system.containerId": containerId });
  }
  return updates;
}

/**
 * The updates that give rebuilt physical items their kept quantity, uses and HP (uses and HP within the new maximum):
 * by build key on a built actor, else by a type and name unique on both sides. Items without kept values get none.
 */
export function itemStateUpdates(snapshot, createdSources) {
  const physical = listOf(createdSources).filter((source) => PHYSICAL_TYPES.includes(source.type));
  const keptStateOf = keptItemState(snapshot, physical);
  const updates = [];
  for (const source of physical) {
    const update = itemStateUpdate(source, keptStateOf(source));
    if (update) updates.push(update);
  }
  return updates;
}

/** The updates that give rebuilt innate spells their kept uses, within the new uses per day. */
export function spellUseUpdates(snapshot, spellSources) {
  const updates = [];
  const spells = listOf(spellSources).filter((item) => item.type === SPELL_TYPE && isRestoreTarget(snapshot, item));
  for (const source of spells) {
    const max = source.system?.location?.uses?.max;
    const kept = snapshot?.spellUses?.get(itemRef(source, snapshot.built));
    if (!isFiniteNumber(max) || !isFiniteNumber(kept)) continue;
    const value = clamp(kept, 0, max);
    if (value !== source.system.location.uses.value) updates.push({ _id: source._id, "system.location.uses.value": value });
  }
  return updates;
}

/**
 * The updates that give rebuilt spellcasting entries their kept slot values (within the new maximum) and expended
 * preparations: per slot, as many prepared copies of a spell are expended as were before. Takes the actor's item
 * sources (entries and their spells).
 */
export function entrySlotUpdates(snapshot, entrySources) {
  const sources = listOf(entrySources);
  const spellRefs = spellRefsById(sources, snapshot?.built);
  const updates = [];
  for (const entry of sources.filter((source) => source.type === ENTRY_TYPE && isRestoreTarget(snapshot, source))) {
    const kept = snapshot?.entries?.get(itemRef(entry, snapshot.built));
    if (!kept) continue;
    const update = entryUpdate(entry, kept, spellRefs);
    if (Object.keys(update).length > 1) updates.push(update);
  }
  return updates;
}

/** The last actor update of a rebuild: kept HP within 0..new max, temp HP, hero points and focus points up to the new max. */
export function actorStateUpdate(snapshot, hpMax, focusMax) {
  const kept = snapshot?.actor ?? {};
  const update = {};
  if (isFiniteNumber(kept.hp)) update["system.attributes.hp.value"] = clampToMax(kept.hp, hpMax);
  if (isFiniteNumber(kept.temp)) update["system.attributes.hp.temp"] = Math.max(0, kept.temp);
  if (isFiniteNumber(kept.heroPoints)) update["system.resources.heroPoints.value"] = Math.max(0, kept.heroPoints);
  if (isFiniteNumber(kept.focus)) update["system.resources.focus.value"] = clampToMax(kept.focus, focusMax);
  return update;
}

function actorValues(system) {
  return {
    hp: system?.attributes?.hp?.value,
    temp: system?.attributes?.hp?.temp,
    heroPoints: system?.resources?.heroPoints?.value,
    focus: system?.resources?.focus?.value
  };
}

/**
 * Whether an item's spell uses and slots go into the snapshot: on a built actor its own roots and the items without a
 * build key, not a split-off or traded-in item sharing a root's key.
 */
function isStateHolder(roots, built, item) {
  const key = buildKeyOf(item);
  if (!built || key === null) return true;
  return roots.get(key)?.id === item._id;
}

/** The kept state of a rebuilt item recreated under its root's previous `_id`, else null (a new or a Foundry item). */
function recreatedRootState(snapshot, source) {
  const kept = snapshot?.roots?.get(buildKeyOf(source));
  return kept && kept.id === source._id ? kept : null;
}

/** Whether a rebuilt item takes kept values: any item of an actor restored by name, else a keyless or recreated one. */
function isRestoreTarget(snapshot, source) {
  if (!snapshot?.built || buildKeyOf(source) === null) return true;
  return recreatedRootState(snapshot, source) !== null;
}

function rootStates(actorSource) {
  const roots = new Map();
  for (const [key, item] of ownRoots(actorSource)) roots.set(key, { id: item._id, ...physicalState(item) });
  return roots;
}

function builtGearKeys(actorSource) {
  const keys = actorSource?.flags?.[MODULE_ID]?.build?.gearKeys;
  return Array.isArray(keys) ? keys.filter((key) => typeof key === "string") : [];
}

function namedStates(items) {
  return items
    .filter((item) => PHYSICAL_TYPES.includes(item.type))
    .map((item) => ({ _id: item._id, type: item.type, name: item.name, ...physicalState(item) }));
}

function physicalState(item) {
  if (!PHYSICAL_TYPES.includes(item.type)) return {};
  const system = item.system ?? {};
  return { quantity: system.quantity, uses: system.uses?.value, hp: system.hp?.value, containerId: system.containerId ?? null };
}

function spellUses(items, built) {
  const uses = new Map();
  for (const item of items.filter((candidate) => candidate.type === SPELL_TYPE)) {
    const value = item.system?.location?.uses?.value;
    if (isFiniteNumber(value)) uses.set(itemRef(item, built), value);
  }
  return uses;
}

function entryStates(items, built) {
  const spellRefs = spellRefsById(items, built);
  const entries = new Map();
  for (const entry of items.filter((item) => item.type === ENTRY_TYPE)) {
    entries.set(itemRef(entry, built), slotStates(entry, spellRefs));
  }
  return entries;
}

/** Per slot key its value and the expended preparations as spell ref → count. */
function slotStates(entry, spellRefs) {
  const slots = {};
  for (const [slotKey, slot] of Object.entries(entry.system?.slots ?? {})) {
    slots[slotKey] = { value: slot?.value, expended: expendedCounts(slot?.prepared, spellRefs) };
  }
  return slots;
}

function expendedCounts(prepared, spellRefs) {
  const counts = new Map();
  for (const preparation of listOf(prepared)) {
    const ref = spellRefs.get(preparation.id);
    if (!preparation.expended || ref === undefined) continue;
    counts.set(ref, (counts.get(ref) ?? 0) + 1);
  }
  return counts;
}

function entryUpdate(entry, kept, spellRefs) {
  const update = { _id: entry._id };
  for (const [slotKey, slot] of Object.entries(entry.system?.slots ?? {})) {
    const keptSlot = kept[slotKey];
    if (!keptSlot) continue;
    addSlotValue(update, slotKey, slot, keptSlot.value);
    addExpendedMarks(update, slotKey, slot.prepared, keptSlot.expended, spellRefs);
  }
  return update;
}

function addSlotValue(update, slotKey, slot, keptValue) {
  if (!isFiniteNumber(keptValue) || !isFiniteNumber(slot?.max)) return;
  const value = clamp(keptValue, 0, slot.max);
  if (value !== slot.value) update[`system.slots.${slotKey}.value`] = value;
}

/** The slot's preparations with the kept expended count per spell, the first copies first; unchanged marks add nothing. */
function addExpendedMarks(update, slotKey, prepared, expended, spellRefs) {
  if (!Array.isArray(prepared) || prepared.length === 0) return;
  const left = new Map(expended);
  const marked = prepared.map((preparation) => {
    const ref = spellRefs.get(preparation?.id);
    const count = left.get(ref) ?? 0;
    if (count > 0) left.set(ref, count - 1);
    return { ...preparation, expended: count > 0 };
  });
  const changed = marked.some((preparation, index) => preparation.expended !== Boolean(prepared[index]?.expended));
  if (changed) update[`system.slots.${slotKey}.prepared`] = marked;
}

function spellRefsById(items, built) {
  const refs = new Map();
  for (const item of items.filter((candidate) => candidate.type === SPELL_TYPE)) refs.set(item._id, itemRef(item, built));
  return refs;
}

/** How an entry or spell is found again after the rebuild: its build key on a built actor, else its type and name. */
function itemRef(item, built) {
  const key = built ? buildKeyOf(item) : null;
  if (key !== null) return `key:${key}`;
  return `name:${item.type}:${item.name}`;
}

function choiceSelections(items) {
  const holders = sourceHolderCounts(items);
  const choices = new Map();
  for (const item of items) {
    const sourceId = sourceIdOf(item);
    if (sourceId === null || holders.get(sourceId) !== 1) continue;
    const selections = itemSelections(item);
    if (selections.length > 0) choices.set(sourceId, new Set(selections));
  }
  return choices;
}

function sourceHolderCounts(items) {
  const counts = new Map();
  for (const item of items) {
    const sourceId = sourceIdOf(item);
    if (sourceId !== null) counts.set(sourceId, (counts.get(sourceId) ?? 0) + 1);
  }
  return counts;
}

function itemSelections(item) {
  return listOf(item.system?.rules)
    .filter((rule) => rule.key === CHOICE_SET && rule.ignored !== true)
    .map((rule) => rule.selection)
    .filter((selection) => selection !== undefined && selection !== null);
}

function sourceIdOf(item) {
  const sourceId = item._stats?.compendiumSource;
  return typeof sourceId === "string" && sourceId !== "" ? sourceId : null;
}

function keptContents(items, deleted) {
  return items
    .filter((item) => !deleted.has(item._id) && deleted.has(item.system?.containerId))
    .map((item) => ({ id: item._id, containerId: item.system.containerId }));
}

function keptItemState(snapshot, physicalSources) {
  if (snapshot?.built) return (source) => recreatedRootState(snapshot, source);
  const matchCurrent = currentItemMatcher(physicalSources, snapshot?.byName ?? []);
  return (source) => matchCurrent(source);
}

function itemStateUpdate(source, kept) {
  if (!kept) return null;
  const update = { _id: source._id };
  const system = source.system ?? {};
  if (isFiniteNumber(kept.quantity) && kept.quantity !== system.quantity) update["system.quantity"] = kept.quantity;
  addLimited(update, "system.uses.value", system.uses, kept.uses);
  addLimited(update, "system.hp.value", system.hp, kept.hp);
  return Object.keys(update).length > 1 ? update : null;
}

/** Sets the kept value of a `{value, max}` field within 0..max when the field exists and the value changes. */
function addLimited(update, path, field, keptValue) {
  if (!isFiniteNumber(keptValue) || field === null || typeof field !== "object") return;
  const value = clampToMax(keptValue, field.max);
  if (value !== field.value) update[path] = value;
}

function clampToMax(value, max) {
  if (!isFiniteNumber(max)) return Math.max(0, value);
  return clamp(value, 0, max);
}

function itemsOf(actorSource) {
  return listOf(actorSource?.items);
}
