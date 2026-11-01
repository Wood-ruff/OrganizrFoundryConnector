import { withBuildFlag } from "./Pf2eItemSources.mjs";

const ENTRYLESS_TYPES = ["ritual", "other"];
const CLASS_DC = "classDc";
const MAX_SLOT_RANK = 10;

/**
 * The spellcastingEntry source of a recipe entry with its slots (spontaneous ones minus the used slots), or null for
 * rituals and other entries (their spells stay outside any entry).
 */
export function entrySource(entry, classSlug, key) {
  if (!createsEntry(entry)) return null;
  const source = {
    name: entry.name,
    type: "spellcastingEntry",
    system: {
      ability: { value: entry.attribute },
      tradition: { value: entry.tradition },
      prepared: { value: entry.type, flexible: Boolean(entry.flexible) },
      proficiency: { value: wholeOf(entry.rank), slug: proficiencySlug(entry, classSlug) },
      slots: slotsOf(entry)
    }
  };
  return withBuildFlag(source, { key });
}

/** A spell's `system.location`: its entry, signature (spontaneous only) and innate uses per day; no entry for rituals. */
export function spellLocation(spell, entry, entryId) {
  if (!createsEntry(entry)) return { value: null };
  const location = { value: entryId };
  if (entry.type === "spontaneous" && spell?.signature) location.signature = true;
  if (entry.type === "innate" && Number.isFinite(spell?.usesPerDay)) {
    const uses = Math.max(0, Math.trunc(spell.usesPerDay));
    location.uses = { value: uses, max: uses };
  }
  return location;
}

/**
 * The `entry.update` of a prepared entry: each spell (recipe order) fills its rank's slot up to the slot max and moves
 * the rest to the lowest higher rank with room (cantrips stay in slot0); the first used marks per rank are expended.
 * `spellIds` maps spell key → created spell id; spells without an id are skipped. Other entry types give `{}`.
 */
export function preparedSlots(entry, spellIds) {
  if (entry?.type !== "prepared") return {};
  const slots = emptyPreparations(entry);
  for (const spell of listOf(entry.spells)) {
    const id = idOf(spellIds, spell.key);
    if (id) prepareSpell(slots, spell, id);
  }
  markExpended(slots, entry.slotsUsed);
  return slotUpdates(slots);
}

function createsEntry(entry) {
  return Boolean(entry) && !ENTRYLESS_TYPES.includes(entry.type);
}

function proficiencySlug(entry, classSlug) {
  if (entry.proficiency !== CLASS_DC) return "";
  return classSlug ?? "";
}

function slotsOf(entry) {
  const slots = {};
  for (const [rank, max] of Object.entries(entry.slots ?? {})) {
    const total = Math.max(0, wholeOf(max));
    slots[`slot${rank}`] = { max: total, value: slotValue(entry, rank, total), prepared: [] };
  }
  return slots;
}

function slotValue(entry, rank, total) {
  if (entry.type !== "spontaneous") return total;
  return Math.max(0, total - wholeOf(entry.slotsUsed?.[rank]));
}

function emptyPreparations(entry) {
  const slots = new Map();
  for (const [rank, max] of Object.entries(entry.slots ?? {})) {
    slots.set(Number(rank), { max: Math.max(0, wholeOf(max)), prepared: [] });
  }
  return slots;
}

function prepareSpell(slots, spell, id) {
  const startRank = spell.cantrip ? 0 : wholeOf(spell.rank);
  let remaining = Math.max(0, wholeOf(spell.prepared));
  let rank = startRank;
  while (remaining > 0 && rank <= MAX_SLOT_RANK) {
    remaining = fillSlot(slots.get(rank), id, remaining);
    if (spell.cantrip) break;
    rank += 1;
  }
}

function fillSlot(slot, id, count) {
  let remaining = count;
  while (slot && remaining > 0 && slot.prepared.length < slot.max) {
    slot.prepared.push({ id, expended: false });
    remaining -= 1;
  }
  return remaining;
}

function markExpended(slots, slotsUsed) {
  for (const [rank, slot] of slots) {
    const used = Math.min(slot.prepared.length, Math.max(0, wholeOf(slotsUsed?.[rank])));
    for (let index = 0; index < used; index++) slot.prepared[index].expended = true;
  }
}

function slotUpdates(slots) {
  const update = {};
  for (const [rank, slot] of slots) {
    if (slot.prepared.length > 0) update[`system.slots.slot${rank}.prepared`] = slot.prepared;
  }
  return update;
}

function idOf(spellIds, key) {
  if (spellIds instanceof Map) return spellIds.get(key) ?? null;
  return spellIds?.[key] ?? null;
}

function wholeOf(value) {
  return Number.isFinite(value) ? Math.trunc(value) : 0;
}

function listOf(value) {
  return Array.isArray(value) ? value.filter((entry) => entry !== null && typeof entry === "object") : [];
}
