/** Turns the active Combat document into plain data for the sidebar template. */
export function combatOverview(combat, user) {
  if (!combat) return { exists: false, started: false, round: 0, combatants: [] };
  const current = combat.combatant ?? null;
  const combatants = (combat.turns ?? [])
    .filter((combatant) => isVisibleTo(combatant, user))
    .map((combatant) => combatantRow(combatant, current));
  return {
    exists: true,
    started: Boolean(combat.started),
    round: combat.round ?? 0,
    combatants
  };
}

function isVisibleTo(combatant, user) {
  if (user?.isGM) return true;
  return combatant.visible !== false;
}

function combatantRow(combatant, current) {
  return {
    id: combatant.id,
    name: combatant.name,
    img: combatant.img,
    initiative: combatant.initiative ?? null,
    isCurrent: current !== null && combatant.id === current.id,
    isDefeated: Boolean(combatant.isDefeated),
    isHidden: Boolean(combatant.hidden),
    isNPC: Boolean(combatant.isNPC)
  };
}
