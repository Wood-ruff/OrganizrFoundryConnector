/**
 * Builds the same JSON Foundry's "Export Data" writes for an actor: the compendium-cleaned
 * document plus `_stats.exportSource` describing the world and system it came from.
 */
export function characterExport(actor, world) {
  const data = actor.toCompendium(null, {});
  data._stats = data._stats ?? {};
  data._stats.exportSource = {
    worldId: world.id,
    uuid: actor.uuid,
    coreVersion: world.coreVersion,
    systemId: world.systemId,
    systemVersion: world.systemVersion
  };
  return data;
}

/** Foundry's export file name for a document, e.g. "fvtt-Actor-my-hero-Ab12Cd34Ef56Gh78.json". */
export function exportFileName(actor) {
  const parts = ["fvtt", actor.documentName, slugify(actor.name), actor.id].filter(Boolean);
  return parts.join("-") + ".json";
}

function slugify(name) {
  if (!name) return "";
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
