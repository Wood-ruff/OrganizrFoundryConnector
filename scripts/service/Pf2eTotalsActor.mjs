const PLAY_STATE_ITEM_TYPES = ["condition", "effect", "affliction"];

/**
 * The actor whose pf2e totals compare with Organizr's: the actor itself, or, when it holds conditions, effects or
 * afflictions, a prepared in-memory copy without them (same ids), so play state never counts as a difference.
 */
export function totalsActor(actor) {
  if (!holdsPlayState(actor)) return actor;
  const items = actor.toObject().items.filter((item) => !isPlayStateItem(item));
  return actor.clone({ items }, { keepId: true });
}

function holdsPlayState(actor) {
  const items = actor?.items?.contents ?? [];
  return items.some(isPlayStateItem);
}

function isPlayStateItem(item) {
  return PLAY_STATE_ITEM_TYPES.includes(item?.type);
}
