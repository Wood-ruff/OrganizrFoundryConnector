import { currentItemMatcher } from "../util/ItemMatch.mjs";
import { copyPathFrom, setAt } from "../util/ObjectPaths.mjs";
import { isFiniteNumber } from "../util/WholeNumbers.mjs";

const DND5E_SYSTEM_ID = "dnd5e";
const NPC_TYPE = "npc";
const CONTAINER_TYPE = "container";
const ADJUSTMENTS_EFFECT_ID = "organizradj00001";
const EXHAUSTION_EFFECT_ID = "dnd5eexhaustion0";
const EXPORT_OWNED_EFFECT_IDS = [ADJUSTMENTS_EFFECT_ID, EXHAUSTION_EFFECT_ID];
const KEPT_ACTOR_PATHS = [
  "attributes.hp.temp", "attributes.hp.tempmax", "attributes.death.success", "attributes.death.failure",
  "attributes.inspiration", "resources.legact.spent", "resources.legres.spent", "resources.lair.inside",
  "resources.primary", "resources.secondary", "resources.tertiary", "favorites", "bastion", "currency"
];
const KEPT_NPC_PATHS = ["attributes.hd.spent"];
const KEPT_ITEM_PATHS = ["uses.spent", "equipped", "attuned"];
const KEPT_ITEM_PATHS_BY_TYPE = { spell: ["prepared"], class: ["hd.spent"], consumable: ["quantity"] };
const KEPT_CONTENT_PATHS = ["uses.spent"];

/** Whether a document's source data comes from a dnd5e world (`_stats.systemId`). */
export function isDnd5eData(data) {
  return data?._stats?.systemId === DND5E_SYSTEM_ID;
}

/**
 * Keeps the current actor's play state in the refreshed one: temporary HP, death saves, inspiration, NPC hit dice
 * spent, legendary actions, resistances and lair, character resources, favorites, bastion and coins; the items
 * present in both keep their play state too (`keepDnd5eItemStates`). Spell slots follow after the import
 * (`dnd5eSlotsSpent`, `dnd5eSlotUpdates`), because dnd5e derives their maximum.
 */
export function keepDnd5eActorState(result, current) {
  result.system = result.system ?? {};
  const currentSystem = current.system ?? {};
  for (const path of keptActorPaths(current)) copyPathFrom(result.system, currentSystem, path);
  keepDnd5eItemStates(result.items ?? [], current.items);
}

/** The slots spent in play per key of the prepared `system.spells`, for the levels the actor has slots in. */
export function dnd5eSlotsSpent(preparedSpells) {
  const spent = {};
  for (const [slotKey, slot] of Object.entries(preparedSpells ?? {})) {
    if (hasSlots(slot)) spent[slotKey] = Math.max(slot.max - slot.value, 0);
  }
  return spent;
}

/**
 * The actor update that spends the slots spent before a refresh again against the refreshed prepared maximum, never
 * below 0; levels the actor had no slots in keep the exported value. Empty when nothing changes.
 */
export function dnd5eSlotUpdates(spentBefore, preparedSpells) {
  const updates = {};
  for (const [slotKey, spent] of Object.entries(spentBefore ?? {})) {
    const slot = preparedSpells?.[slotKey];
    if (!isFiniteNumber(slot?.max)) continue;
    const value = Math.max(slot.max - spent, 0);
    if (value !== slot.value) updates[`system.spells.${slotKey}.value`] = value;
  }
  return updates;
}

/**
 * Items present in both (same `_id`, type and name, else a type and name unique on both sides) keep their spent
 * uses and activity uses, equipped and attuned state, a spell's preparation, a class's hit dice spent and a
 * consumable's quantity.
 */
export function keepDnd5eItemStates(items, currentItems) {
  keepMatchedItems(items, currentItems, keptItemPaths);
}

/** Container contents that come back under a type and name unique on both sides keep their spent uses. */
export function keepDnd5eContentUses(contents, currentContents) {
  keepMatchedItems(contents, currentContents, () => KEPT_CONTENT_PATHS);
}

/**
 * The refreshed actor's effects: the current ones without the two the export owns, plus the export's adjustments
 * effect, plus the exhaustion effect of the current actor when keeping play state (else the export's). The stored
 * exhaustion is set to the current actor's level, because dnd5e turns a changed stored value into a level change.
 */
export function applyDnd5eEffects(result, current, incoming, keepPlayState) {
  const currentEffects = current?.effects ?? [];
  const incomingEffects = incoming?.effects ?? [];
  const exhaustionSource = keepPlayState ? currentEffects : incomingEffects;
  result.effects = structuredClone([
    ...currentEffects.filter((effect) => !EXPORT_OWNED_EFFECT_IDS.includes(effect?._id)),
    ...effectsWithId(incomingEffects, ADJUSTMENTS_EFFECT_ID),
    ...effectsWithId(exhaustionSource, EXHAUSTION_EFFECT_ID)
  ]);
  setAt(result, "system.attributes.exhaustion", exhaustionLevel(currentEffects));
}

/** A dnd5e container item keeps its current coins (`system.currency`). */
export function keepDnd5eContainerCurrency(result, current) {
  if (current?.type !== CONTAINER_TYPE || result.type !== CONTAINER_TYPE) return;
  copyPathFrom(result, current, "system.currency");
}

function keptActorPaths(current) {
  if (current.type !== NPC_TYPE) return KEPT_ACTOR_PATHS;
  return [...KEPT_ACTOR_PATHS, ...KEPT_NPC_PATHS];
}

function keptItemPaths(item) {
  return [...KEPT_ITEM_PATHS, ...(KEPT_ITEM_PATHS_BY_TYPE[item.type] ?? [])];
}

function hasSlots(slot) {
  return isFiniteNumber(slot?.max) && slot.max > 0 && isFiniteNumber(slot.value);
}

function keepMatchedItems(items, currentItems, pathsOf) {
  const currentItemOf = currentItemMatcher(items, currentItems);
  for (const item of items) {
    const currentItem = currentItemOf(item);
    if (!currentItem) continue;
    item.system = item.system ?? {};
    for (const path of pathsOf(item)) copyPathFrom(item.system, currentItem.system, path);
    keepActivityUses(item.system.activities, currentItem.system?.activities);
  }
}

/** Each activity the current item has under the same id keeps its spent uses. */
function keepActivityUses(activities, currentActivities) {
  for (const [activityId, activity] of Object.entries(activities ?? {})) {
    const currentActivity = currentActivities?.[activityId];
    if (activity && currentActivity) copyPathFrom(activity, currentActivity, "uses.spent");
  }
}

function effectsWithId(effects, effectId) {
  return effects.filter((effect) => effect?._id === effectId);
}

function exhaustionLevel(effects) {
  const level = effectsWithId(effects, EXHAUSTION_EFFECT_ID)[0]?.system?.level;
  return isFiniteNumber(level) ? level : 0;
}
