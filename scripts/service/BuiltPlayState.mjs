import { MODULE_ID } from "../config/ModuleId.mjs";
import { currentItemMatcher } from "../util/ItemMatch.mjs";
import { isFiniteNumber } from "../util/WholeNumbers.mjs";
import { buildKeyOf } from "./Pf2eItemSources.mjs";

const ABC_TYPES = ["ancestry", "heritage", "background", "class", "deity"];
const PHYSICAL_TYPES = ["armor", "shield", "weapon", "equipment", "consumable", "treasure", "backpack", "ammo", "book"];
const KEPT_TYPES_WITHOUT_BUILD = ["condition", "effect"];
const ENTRY_TYPE = "spellcastingEntry";
const SPELL_TYPE = "spell";
const CHOICE_SET = "ChoiceSet";

/**
 * The play state of a pf2e actor before it is rebuilt from Organizr: HP, temp HP, hero and focus points; per build key
 * the root `_id` and the quantity, uses and HP of physical items; innate spell uses and spell slot values with the
 * expended preparations per spell; the ChoiceSet selections per compendium source (`choices`, only sources one item
 * holds) and the kept items inside a root that will be deleted (`containers`). An actor the connector did not build
 * keeps its item values by type and name (`byName`), its entries and spells by name, and no ids.
 */
export function snapshotPlayState(actorSource) {
  const items = itemsOf(actorSource);
  const built = isBuiltActor(actorSource);
  const deleted = new Set(rootIdsToDelete(actorSource));
  return {
    built,
    actor: actorValues(actorSource?.system),
    roots: built ? rootStates(items) : new Map(),
    byName: built ? [] : namedStates(items),
    spellUses: spellUses(items, built),
    entries: entryStates(items, built),
    choices: choiceSelections(items),
    containers: keptContents(items, deleted)
  };
}

/**
 * The ids of the items a rebuild deletes, in item order: on a built actor every item with a build key, every item
 * those grant (any `onDelete` kind) and every item placed in a deleted ancestry, heritage, background, class or deity,
 * repeated until nothing is added; on any other actor every item except conditions and effects.
 */
export function rootIdsToDelete(actorSource) {
  const items = itemsOf(actorSource);
  if (!isBuiltActor(actorSource)) {
    return items.filter((item) => !KEPT_TYPES_WITHOUT_BUILD.includes(item.type)).map((item) => item._id);
  }
  const deleted = new Set(items.filter((item) => buildKeyOf(item) !== null).map((item) => item._id));
  const parents = grantParents(items);
  const abcIds = new Set(items.filter((item) => ABC_TYPES.includes(item.type)).map((item) => item._id));
  let grown = true;
  while (grown) {
    grown = false;
    for (const item of items) {
      if (deleted.has(item._id) || !belongsToDeleted(item, deleted, parents, abcIds)) continue;
      deleted.add(item._id);
      grown = true;
    }
  }
  return items.filter((item) => deleted.has(item._id)).map((item) => item._id);
}

/** The `_id` the root of this build key had before the rebuild, or null (new key, or an actor the connector did not build). */
export function keptRootId(snapshot, key) {
  return snapshot?.roots?.get(key)?.id ?? null;
}

/** The updates that put kept items back into their recreated containers (`[{_id, "system.containerId"}]`). */
export function containerRestores(snapshot, createdIds) {
  const present = new Set(createdIds ?? []);
  return listOf(snapshot?.containers)
    .filter((content) => present.has(content.containerId))
    .map((content) => ({ _id: content.id, "system.containerId": content.containerId }));
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
  for (const source of listOf(spellSources).filter((item) => item.type === SPELL_TYPE)) {
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
  for (const entry of sources.filter((source) => source.type === ENTRY_TYPE)) {
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

/** Whether the connector built this actor (`flags[MODULE].build`). */
export function isBuiltActor(actorSource) {
  const build = actorSource?.flags?.[MODULE_ID]?.build;
  return build !== null && typeof build === "object";
}

function actorValues(system) {
  return {
    hp: system?.attributes?.hp?.value,
    temp: system?.attributes?.hp?.temp,
    heroPoints: system?.resources?.heroPoints?.value,
    focus: system?.resources?.focus?.value
  };
}

function rootStates(items) {
  const roots = new Map();
  for (const item of items) {
    const key = buildKeyOf(item);
    if (key === null || roots.has(key)) continue;
    roots.set(key, { id: item._id, ...physicalState(item) });
  }
  return roots;
}

function namedStates(items) {
  return items
    .filter((item) => PHYSICAL_TYPES.includes(item.type))
    .map((item) => ({ _id: item._id, type: item.type, name: item.name, ...physicalState(item) }));
}

function physicalState(item) {
  if (!PHYSICAL_TYPES.includes(item.type)) return {};
  return { quantity: item.system?.quantity, uses: item.system?.uses?.value, hp: item.system?.hp?.value };
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

/** Granted id → granter ids, read from both sides of pf2e's grant link (`itemGrants` and `grantedBy`). */
function grantParents(items) {
  const parents = new Map();
  const link = (parentId, childId) => {
    if (!parents.has(childId)) parents.set(childId, new Set());
    parents.get(childId).add(parentId);
  };
  for (const item of items) {
    for (const grant of Object.values(item.flags?.pf2e?.itemGrants ?? {})) {
      if (typeof grant?.id === "string") link(item._id, grant.id);
    }
    const granter = item.flags?.pf2e?.grantedBy?.id;
    if (typeof granter === "string") link(granter, item._id);
  }
  return parents;
}

function belongsToDeleted(item, deleted, parents, abcIds) {
  const granters = parents.get(item._id) ?? new Set();
  if ([...granters].some((parentId) => deleted.has(parentId))) return true;
  const location = item.system?.location;
  return abcIds.has(location) && deleted.has(location);
}

function keptItemState(snapshot, physicalSources) {
  if (snapshot?.built) return (source) => snapshot.roots.get(buildKeyOf(source)) ?? null;
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

function clamp(value, low, high) {
  return Math.min(Math.max(value, low), Math.max(low, high));
}

function itemsOf(actorSource) {
  return listOf(actorSource?.items);
}

function listOf(value) {
  return Array.isArray(value) ? value.filter((entry) => entry !== null && typeof entry === "object") : [];
}
