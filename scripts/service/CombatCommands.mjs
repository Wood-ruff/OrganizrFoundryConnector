const COMMAND_TYPES = new Set(["setCondition", "removeCondition", "removeEffect", "setStatus"]);

/** The actor state a command is checked against: conditions, effects and core statuses as plain lists. */
export function actorCommandState(actorEntry) {
  const actor = actorEntry ?? {};
  return {
    conditions: (actor.conditions ?? []).map((condition) => ({ slug: condition.slug ?? null, value: condition.value ?? null })),
    effects: (actor.effects ?? []).map((effect) => ({ kind: effect.kind ?? null, id: effect.id ?? null, slug: effect.slug ?? null })),
    statuses: [...(actor.statuses ?? [])]
  };
}

/** Turns an Organizr command into one Foundry operation, or a skip with a reason when nothing is to do. */
export function commandOperation(command, state) {
  if (!COMMAND_TYPES.has(command.type)) return skip("unknown-type");
  if (command.type === "setCondition") return setConditionOperation(command, state);
  if (command.type === "removeCondition") return removeConditionOperation(command, state);
  if (command.type === "removeEffect") return removeEffectOperation(command, state);
  return setStatusOperation(command, state);
}

/** Body of the acknowledgement: one result per handled command. */
export function ackBody(results) {
  return { results: results.map((result) => ({ id: result.id, ok: Boolean(result.ok), error: result.error ?? null })) };
}

function setConditionOperation(command, state) {
  if (!command.slug) return skip("missing-slug");
  const value = numberOrNull(command.value);
  const existing = state.conditions.find((condition) => condition.slug === command.slug);
  if (existing && existing.value === value) return skip("already-set");
  return { op: "setCondition", slug: command.slug, value };
}

function removeConditionOperation(command, state) {
  if (!command.slug) return skip("missing-slug");
  const present = state.conditions.some((condition) => condition.slug === command.slug)
    || state.statuses.includes(command.slug);
  if (!present) return skip("not-present");
  return { op: "removeCondition", slug: command.slug };
}

function removeEffectOperation(command, state) {
  const effect = state.effects.find((candidate) => matchesEffect(candidate, command));
  if (!effect) return skip("not-present");
  return { op: "removeEffect", kind: effect.kind, id: effect.id };
}

function matchesEffect(effect, command) {
  if (command.effectId) return effect.id === command.effectId;
  return Boolean(command.slug) && effect.slug === command.slug;
}

function setStatusOperation(command, state) {
  if (!command.slug) return skip("missing-slug");
  const active = Boolean(command.active);
  if (state.statuses.includes(command.slug) === active) return skip("already-set");
  return { op: "setStatus", slug: command.slug, active };
}

function numberOrNull(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function skip(reason) {
  return { op: "skip", reason };
}
