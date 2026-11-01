/** Identity of the running world and system, as Foundry stamps it into exports. */
export function worldInfo() {
  return {
    id: game.world.id,
    title: game.world.title,
    coreVersion: game.version,
    systemId: game.system.id,
    systemVersion: game.system.version
  };
}

/** The world's dnd5e rules version ("modern" or "legacy"); empty in other systems. */
export function dnd5eRulesVersion() {
  if (game.system.id !== "dnd5e") return "";
  return game.settings.get("dnd5e", "rulesVersion") ?? "";
}

/** Users as plain rows for the services. */
export function userRows() {
  return game.users.map((user) => ({ id: user.id, name: user.name, isGM: user.isGM }));
}
