/**
 * Collects everything Foundry knows about one combatant as plain JSON-safe data:
 * the combatant, its token and actor source data, plus the actor's prepared (derived) system data.
 */
export function combatantSnapshot(combatant) {
  const token = combatant.token ?? null;
  const actor = combatant.actor ?? null;
  return {
    capturedAt: new Date().toISOString(),
    combatant: sourceOf(combatant),
    token: token ? sourceOf(token) : null,
    actor: actor ? sourceOf(actor) : null,
    actorDerived: actor ? jsonSafe(actor.system) : null
  };
}

/** JSON text of a snapshot, stable key order as produced, two-space indent. */
export function snapshotJson(snapshot) {
  return JSON.stringify(snapshot, null, 2);
}

function sourceOf(document) {
  if (typeof document.toObject === "function") return jsonSafe(document.toObject());
  return jsonSafe(document);
}

/** Deep-copies a value through JSON, dropping functions and cutting reference cycles. */
export function jsonSafe(value) {
  const seen = new WeakSet();
  return JSON.parse(JSON.stringify(value, (key, current) => {
    if (typeof current !== "object" || current === null) return current;
    if (seen.has(current)) return "[circular]";
    seen.add(current);
    return current;
  }) ?? "null");
}
