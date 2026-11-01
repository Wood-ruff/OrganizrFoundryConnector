const ORDERED_CATEGORIES = ["ancestry", "class", "general", "skill"];
const SLOT_GROUPS = {
  ancestry: ["ancestry"],
  class: ["class"],
  general: ["general"],
  skill: ["skill", "general"]
};
const TRAILING_LEVEL = /-(\d+)$/;

/** Recipe features in build order: ancestry, class, general, skill, then the rest; each part by level, then recipe order. */
export function featOrder(features) {
  const list = Array.isArray(features) ? features : [];
  const parts = ORDERED_CATEGORIES.map((category) => list.filter((feature) => feature?.category === category));
  parts.push(list.filter((feature) => !ORDERED_CATEGORIES.includes(feature?.category)));
  return parts.flatMap(byLevel);
}

/** The feat groups whose slots a feature of this category may take, in preference order (none for other categories). */
export function slotGroupsFor(category) {
  return SLOT_GROUPS[category] ?? [];
}

/**
 * The empty feat slots of pf2e's feat groups (`[...actor.feats]`: `{id, slots: {<slotId>: {id, level, feat}}}`) as
 * `[{group, slotId, level}]`; the level is the slot's, else the trailing number of its id; none above the actor level.
 */
export function freeFeatSlots(featGroups, actorLevel) {
  const free = [];
  for (const group of featGroups ?? []) {
    for (const slot of Object.values(group?.slots ?? {})) {
      const level = slotLevel(slot);
      if (slot?.feat || level === null || level > actorLevel) continue;
      free.push({ group: group.id, slotId: slot.id, level });
    }
  }
  return free;
}

/**
 * The free slot for a feature: per group of its category in order, the slot of its level, else the lowest slot above
 * it. Null when no group has one.
 */
export function slotFor(entry, freeSlots) {
  const level = Number.isFinite(entry?.level) ? entry.level : 0;
  for (const group of slotGroupsFor(entry?.category)) {
    const slots = (freeSlots ?? []).filter((slot) => slot.group === group && slot.level >= level);
    const exact = slots.find((slot) => slot.level === level);
    if (exact) return exact;
    const lowest = lowestLevel(slots);
    if (lowest) return lowest;
  }
  return null;
}

/** The features by level; the sort is stable, so equal levels keep recipe order. */
function byLevel(features) {
  return [...features].sort((left, right) => levelOf(left) - levelOf(right));
}

function levelOf(feature) {
  return Number.isFinite(feature?.level) ? feature.level : 0;
}

function slotLevel(slot) {
  if (Number.isFinite(slot?.level)) return slot.level;
  const trailing = TRAILING_LEVEL.exec(String(slot?.id ?? ""));
  return trailing ? Number(trailing[1]) : null;
}

function lowestLevel(slots) {
  let lowest = null;
  for (const slot of slots) {
    if (lowest === null || slot.level < lowest.level) lowest = slot;
  }
  return lowest;
}
