import { MODULE_ID } from "../config/ModuleId.mjs";

const OWNER_LEVEL = 3;

/** Rows for the player-character section: every actor of type "character", sorted by name. */
export function characterRows(actors, users) {
  const players = (users ?? []).filter((user) => !user.isGM);
  return actors
    .filter((actor) => actor.type === "character")
    .map((actor) => characterRow(actor, players))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function characterRow(actor, players) {
  const owners = players.filter((user) => ownsActor(user, actor)).map((user) => user.name);
  const sync = actor.flags?.[MODULE_ID]?.sync ?? null;
  return {
    id: actor.id,
    name: actor.name,
    img: actor.img,
    owners,
    ownersLabel: owners.join(", "),
    hasPlayerOwner: owners.length > 0,
    synced: sync !== null,
    syncedAt: sync?.syncedAt ?? null
  };
}

function ownsActor(user, actor) {
  const ownership = actor.ownership ?? {};
  const level = ownership[user.id] ?? ownership.default ?? 0;
  return level >= OWNER_LEVEL;
}
