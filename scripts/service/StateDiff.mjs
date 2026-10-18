/** The part of a combatant entry that state pushes compare against the last push. */
export function stateSnapshot(entry) {
  const actor = entry.actor ?? {};
  return {
    initiative: entry.initiative ?? null,
    defeated: Boolean(entry.defeated),
    hidden: Boolean(entry.hidden),
    hp: hpSnapshot(actor.hp),
    statuses: [...(actor.statuses ?? [])],
    conditions: (actor.conditions ?? []).map(conditionSnapshot),
    effects: (actor.effects ?? []).map(effectSnapshot)
  };
}

/** What changed from `previous` to `current`; null without a previous snapshot. */
export function diffState(previous, current) {
  if (!previous) return null;
  return {
    conditions: diffConditions(previous.conditions, current.conditions),
    statuses: diffStatuses(previous.statuses, current.statuses),
    effects: diffEffects(previous.effects, current.effects),
    hp: diffHp(previous.hp, current.hp),
    tempHp: diffScalar(previous.hp?.temp ?? null, current.hp?.temp ?? null),
    defeated: diffScalar(previous.defeated, current.defeated),
    hidden: diffScalar(previous.hidden, current.hidden),
    initiative: diffScalar(previous.initiative, current.initiative)
  };
}

/** False only when a diff exists and every part of it is empty. */
export function hasChanges(changes) {
  if (!changes) return true;
  const lists = [changes.conditions, changes.statuses, changes.effects].flatMap((part) => Object.values(part));
  if (lists.some((list) => list.length > 0)) return true;
  return [changes.hp, changes.tempHp, changes.defeated, changes.hidden, changes.initiative].some((part) => part !== null);
}

function hpSnapshot(hp) {
  if (!hp) return null;
  return { value: hp.value ?? null, max: hp.max ?? null, temp: hp.temp ?? 0 };
}

function conditionSnapshot(condition) {
  return { slug: condition.slug ?? null, name: condition.name ?? null, value: condition.value ?? null };
}

function effectSnapshot(effect) {
  return { kind: effect.kind ?? null, id: effect.id ?? null, name: effect.name ?? null, slug: effect.slug ?? null };
}

function conditionKey(condition) {
  return condition.slug ?? condition.name;
}

function effectKey(effect) {
  return `${effect.kind}:${effect.id ?? effect.slug ?? effect.name}`;
}

function diffConditions(before, after) {
  const previousByKey = new Map(before.map((condition) => [conditionKey(condition), condition]));
  const currentByKey = new Map(after.map((condition) => [conditionKey(condition), condition]));
  const added = after.filter((condition) => !previousByKey.has(conditionKey(condition)));
  const removed = before.filter((condition) => !currentByKey.has(conditionKey(condition)));
  const changed = [];
  for (const condition of after) {
    const previous = previousByKey.get(conditionKey(condition));
    if (previous && previous.value !== condition.value) changed.push({ ...condition, previousValue: previous.value });
  }
  return { added, removed, changed };
}

function diffStatuses(before, after) {
  const previous = new Set(before);
  const current = new Set(after);
  return {
    added: after.filter((status) => !previous.has(status)),
    removed: before.filter((status) => !current.has(status))
  };
}

function diffEffects(before, after) {
  const previous = new Set(before.map(effectKey));
  const current = new Set(after.map(effectKey));
  return {
    added: after.filter((effect) => !previous.has(effectKey(effect))),
    removed: before.filter((effect) => !current.has(effectKey(effect)))
  };
}

function diffHp(before, after) {
  const previous = before?.value ?? null;
  const value = after?.value ?? null;
  if (previous === value) return null;
  const delta = typeof previous === "number" && typeof value === "number" ? value - previous : null;
  return { previous, value, delta };
}

function diffScalar(previous, value) {
  if (previous === value) return null;
  return { previous, value };
}

