import {
  isPf1Data, keepPf1ContainerInventory, keepPf1ItemUses, keepPf1Resources, keepPf1SpellbookSlots
} from "./Pf1PlayState.mjs";

const DEFAULT_TOKEN_IMAGE = "icons/svg/mystery-man.svg";
const PLAY_STATE_ITEM_TYPES = ["condition", "effect", "buff"];
const SPELLCASTING_ENTRY = "spellcastingEntry";

/**
 * The data that replaces a world document refreshed from Organizr: the incoming document with the current
 * token, HP, spent focus points, uses and spell slots, conditions, effects, buffs and (for loot actors and pf1
 * containers unless restoring) inventory kept. Never mutates its inputs.
 */
export function refreshedDocument(current, incoming, { restoreInventory = false, tokenFromIncoming = false, keepPlayState = true } = {}) {
  const result = structuredClone(incoming);
  result.flags = mergedFlags(current?.flags, incoming?.flags);
  if (!isActorData(current)) {
    if (!restoreInventory && isPf1Data(current)) keepPf1ContainerInventory(result, current);
    return result;
  }
  result.prototypeToken = keptToken(current, incoming, tokenFromIncoming);
  if (keepPlayState) {
    keepCurrentHitPoints(result, current);
    keepCurrentFocusPoints(result, current);
  }
  result.items = keptItems(current, incoming, restoreInventory);
  if (keepPlayState) keepCurrentSlots(result.items, current.items);
  if (keepPlayState && isPf1Data(current)) keepPf1PlayState(result, current);
  result.effects = structuredClone(current.effects ?? []);
  return result;
}

/** The replacement for a document created blank a moment ago: incoming data over the system's default token. */
export function seededDocument(created, incoming) {
  return refreshedDocument(created, incoming, { restoreInventory: true, tokenFromIncoming: true, keepPlayState: false });
}

/** The data a new document is created with before Import Data fills it: no system data reaches `create`. */
export function createSeed(incoming) {
  return { name: incoming?.name, type: incoming?.type, flags: structuredClone(incoming?.flags ?? {}) };
}

/** False when Import Data would silently ignore the document (pf2e needs `system._migration`). */
export function importDataApplies(systemId, data) {
  if (systemId !== "pf2e") return true;
  return Boolean(data?.system?._migration);
}

function keepPf1PlayState(result, current) {
  keepPf1Resources(result, current);
  keepPf1SpellbookSlots(result, current);
  keepPf1ItemUses(result.items, current.items);
}

function isActorData(data) {
  return Boolean(data) && (data.prototypeToken !== undefined || Array.isArray(data.items));
}

function mergedFlags(currentFlags, incomingFlags) {
  return { ...structuredClone(currentFlags ?? {}), ...structuredClone(incomingFlags ?? {}) };
}

function keptToken(current, incoming, tokenFromIncoming) {
  const token = structuredClone(current.prototypeToken ?? {});
  if (tokenFromIncoming) overlayToken(token, incoming?.prototypeToken);
  const texture = token.texture ?? {};
  if (incoming?.img && followsActorImage(texture.src, current.img)) {
    token.texture = { ...texture, src: incoming.img };
  }
  return token;
}

function overlayToken(token, incomingToken) {
  for (const [key, value] of Object.entries(incomingToken ?? {})) {
    if (key === "texture") token.texture = { ...(token.texture ?? {}), ...structuredClone(value ?? {}) };
    else token[key] = structuredClone(value);
  }
}

function followsActorImage(textureSrc, actorImage) {
  return !textureSrc || textureSrc === DEFAULT_TOKEN_IMAGE || textureSrc === actorImage;
}

function keepCurrentHitPoints(result, current) {
  const currentHp = current.system?.attributes?.hp;
  const incomingHp = result.system?.attributes?.hp;
  if (!currentHp || !incomingHp) return;
  const max = incomingHp.max ?? currentHp.max;
  if (typeof currentHp.value === "number") {
    incomingHp.value = typeof max === "number" ? Math.min(currentHp.value, max) : currentHp.value;
  }
  if (currentHp.temp !== undefined) incomingHp.temp = currentHp.temp;
}

function keepCurrentFocusPoints(result, current) {
  const currentFocus = current.system?.resources?.focus;
  const incomingFocus = result.system?.resources?.focus;
  if (!currentFocus || !incomingFocus || typeof currentFocus.value !== "number") return;
  incomingFocus.value = clampedTo(currentFocus.value, incomingFocus.max);
}

/** Each spellcasting entry that is still there (same _id) keeps the slots spent in play, up to the new maximum. */
function keepCurrentSlots(items, currentItems) {
  const currentEntries = new Map((currentItems ?? [])
    .filter((item) => item.type === SPELLCASTING_ENTRY)
    .map((item) => [item._id, item]));
  for (const item of items) {
    const currentEntry = item.type === SPELLCASTING_ENTRY ? currentEntries.get(item._id) : undefined;
    if (!currentEntry) continue;
    for (const [slotKey, slot] of Object.entries(item.system?.slots ?? {})) {
      const currentValue = currentEntry.system?.slots?.[slotKey]?.value;
      if (slot && typeof currentValue === "number") slot.value = clampedTo(currentValue, slot.max);
    }
  }
}

function clampedTo(value, max) {
  return typeof max === "number" ? Math.min(value, max) : value;
}

function keptItems(current, incoming, restoreInventory) {
  if (current.type === "loot" && !restoreInventory) return structuredClone(current.items ?? []);
  const incomingItems = structuredClone(incoming?.items ?? []);
  const incomingIds = new Set(incomingItems.map((item) => item._id));
  const playState = (current.items ?? [])
    .filter((item) => PLAY_STATE_ITEM_TYPES.includes(item.type))
    .filter((item) => !incomingIds.has(item._id));
  return [...incomingItems, ...structuredClone(playState)];
}
