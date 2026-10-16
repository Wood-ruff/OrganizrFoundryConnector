import { jsonSafe } from "./CombatantSnapshot.mjs";
import { knownFileId } from "./CharacterSync.mjs";

/**
 * Everything Organizr needs about a running combat as plain JSON: the world, the combat state,
 * every combatant with its token and the live state of its actor, combatant groups and pf2e metrics.
 */
export function combatPayload(combat, world, event) {
  const current = combat.combatant ?? null;
  const turns = combat.turns ?? [];
  return {
    event: { ...event, at: new Date().toISOString() },
    world,
    combat: combatEntry(combat, current),
    combatants: turns.map((combatant, index) => combatantEntry(combatant, index, current)),
    groups: groupEntries(combat)
  };
}

/** What happened between two combat states: start, round, turn or nothing, with the direction of travel. */
export function combatEvent(prior, current) {
  const from = { round: prior?.round ?? 0, turn: prior?.turn ?? null, combatantId: prior?.combatantId ?? null };
  const to = { round: current?.round ?? 0, turn: current?.turn ?? null, combatantId: current?.combatantId ?? null };
  if (from.round === 0 && to.round >= 1) return { type: "start", direction: 1 };
  if (to.round !== from.round) return { type: "round", direction: Math.sign(to.round - from.round) };
  if (sameCombatant(from, to)) return { type: "update", direction: 0 };
  if (to.turn !== from.turn) return { type: "turn", direction: Math.sign((to.turn ?? 0) - (from.turn ?? 0)) };
  return { type: "update", direction: 0 };
}

function sameCombatant(from, to) {
  return from.combatantId !== null && from.combatantId === to.combatantId;
}

/** One combatant as the start payload lists it; also the body of a combatant state sync. */
export function combatantState(combatant, event) {
  const current = combatant.parent?.combatant ?? combatant.combat?.combatant ?? null;
  const index = (combatant.parent?.turns ?? []).findIndex((turn) => turn.id === combatant.id);
  return { event: { ...event, at: new Date().toISOString() }, ...combatantEntry(combatant, index, current) };
}

const MOVE_ACTIONS = { "round:1": "next-round", "round:-1": "previous-round", "turn:1": "next-turn", "turn:-1": "previous-turn" };

/** The Organizr combat move an event maps to ("next-turn", …), or null when it is no move. */
export function moveActionOf(event) {
  return MOVE_ACTIONS[`${event?.type}:${event?.direction}`] ?? null;
}

const STATUS_ITEM_TYPES = ["condition", "effect"];

/** Whether a changed document can change a combatant's statuses: an active effect, or a pf2e condition/effect item. */
export function isStatusDocument(documentName, type) {
  if (documentName === "ActiveEffect") return true;
  return documentName === "Item" && STATUS_ITEM_TYPES.includes(type);
}

/** The combatant whose actor is `actor` (by uuid), or null. */
export function combatantOfActor(combatants, actor) {
  if (!actor?.uuid) return null;
  return [...(combatants ?? [])].find((combatant) => combatant.actor?.uuid === actor.uuid) ?? null;
}

/** Localization key for a failed combat push, by HTTP status (0 = no response). */
export function combatErrorKey(status) {
  if (status === 0) return "ORGANIZR.Combat.Errors.Unreachable";
  if (status === 401) return "ORGANIZR.Combat.Errors.TokenRejected";
  if (status === 403) return "ORGANIZR.Combat.Errors.WrongProject";
  if (status === 404) return "ORGANIZR.Combat.Errors.NotFound";
  if (status === 409) return "ORGANIZR.Combat.Errors.AlreadyRunning";
  return "ORGANIZR.Combat.Errors.ServerError";
}

function combatEntry(combat, current) {
  const scene = combat.scene ?? null;
  return {
    id: combat.id ?? null,
    uuid: combat.uuid ?? null,
    name: combat.name ?? null,
    scene: scene ? { id: scene.id ?? null, name: scene.name ?? null } : null,
    active: Boolean(combat.active),
    started: Boolean(combat.started),
    round: combat.round ?? 0,
    turn: combat.turn ?? null,
    currentCombatantId: current?.id ?? null,
    nextCombatantId: combat.nextCombatant?.id ?? null,
    metrics: metricsOf(combat)
  };
}

function metricsOf(combat) {
  const metrics = combat.metrics;
  if (!metrics) return null;
  return {
    threat: metrics.threat ?? null,
    budget: jsonSafe(metrics.budget ?? null),
    award: { xp: metrics.award?.xp ?? null, recipientIds: idsOf(metrics.award?.recipients) },
    participants: {
      partyIds: idsOf(metrics.participants?.party),
      oppositionIds: idsOf(metrics.participants?.opposition)
    }
  };
}

function idsOf(documents) {
  return (documents ?? []).map((document) => document?.id ?? null);
}

function combatantEntry(combatant, index, current) {
  return {
    id: combatant.id,
    name: combatant.name ?? null,
    img: combatant.img ?? null,
    initiative: combatant.initiative ?? null,
    turnIndex: index,
    isCurrent: current !== null && combatant.id === current.id,
    defeated: Boolean(combatant.defeated ?? combatant.isDefeated),
    hidden: Boolean(combatant.hidden),
    npc: Boolean(combatant.isNPC),
    roundJoined: combatant.roundJoined ?? null,
    groupId: groupIdOf(combatant.group),
    players: (combatant.players ?? []).map((user) => user.name),
    token: tokenEntry(combatant.token ?? null),
    actor: actorEntry(combatant.actor ?? null)
  };
}

function groupIdOf(group) {
  if (!group) return null;
  return typeof group === "string" ? group : group.id ?? null;
}

function tokenEntry(token) {
  if (!token) return null;
  return {
    id: token.id ?? null,
    uuid: token.uuid ?? null,
    name: token.name ?? null,
    x: token.x ?? null,
    y: token.y ?? null,
    elevation: token.elevation ?? null,
    width: token.width ?? null,
    height: token.height ?? null,
    disposition: token.disposition ?? null,
    hidden: Boolean(token.hidden),
    actorLink: Boolean(token.actorLink)
  };
}

function actorEntry(actor) {
  if (!actor) return null;
  const system = actor.system ?? {};
  return {
    id: actor.id ?? null,
    uuid: actor.uuid ?? null,
    type: actor.type ?? null,
    name: actor.name ?? null,
    isToken: Boolean(actor.isToken),
    organizrFileId: knownFileId(actor),
    level: actor.level ?? system.details?.level?.value ?? null,
    alliance: actor.alliance ?? null,
    hp: hpOf(actor, system),
    ac: system.attributes?.ac?.value ?? null,
    speed: speedOf(system),
    saves: savesOf(actor, system),
    statuses: listOf(actor.statuses),
    conditions: conditionsOf(actor),
    effects: effectsOf(actor),
    traits: listOf(actor.traits)
  };
}

function listOf(value) {
  if (!value || typeof value[Symbol.iterator] !== "function" || typeof value === "string") return [];
  return [...value];
}

/** Land speed in feet: pf2e `attributes.speed.value`, dnd5e `attributes.movement.walk`, pf1 `attributes.speed.land.total`. */
function speedOf(system) {
  const speed = system.attributes?.speed ?? null;
  return numberOrNull(speed?.total ?? speed?.value ?? speed?.land?.total ?? system.attributes?.movement?.walk);
}

/** Fortitude/reflex/will: pf2e `actor.saves.<name>.mod`, pf1 `attributes.savingThrows.<fort|ref|will>.total`, dnd5e con/dex/wis saves. */
function savesOf(actor, system) {
  return {
    fortitude: saveOf(actor, system, "fortitude", "fort", "con"),
    reflex: saveOf(actor, system, "reflex", "ref", "dex"),
    will: saveOf(actor, system, "will", "will", "wis")
  };
}

function saveOf(actor, system, pf2eName, pf1Name, dnd5eAbility) {
  const dnd5eSave = system.abilities?.[dnd5eAbility]?.save;
  return numberOrNull(actor.saves?.[pf2eName]?.mod
    ?? system.saves?.[pf2eName]?.value
    ?? system.attributes?.savingThrows?.[pf1Name]?.total
    ?? dnd5eSave?.value ?? dnd5eSave);
}

function numberOrNull(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function hpOf(actor, system) {
  const hp = actor.hitPoints ?? system.attributes?.hp ?? null;
  if (!hp) return null;
  return {
    value: hp.value ?? null,
    max: hp.max ?? null,
    temp: hp.temp ?? 0,
    unrecoverable: hp.unrecoverable ?? 0
  };
}

function conditionsOf(actor) {
  const conditions = listOf(actor.conditions?.active ?? actor.itemTypes?.condition);
  return conditions.map((condition) => ({
    slug: condition.slug ?? null,
    name: condition.name ?? null,
    value: condition.value ?? null
  }));
}

function effectsOf(actor) {
  const items = (actor.itemTypes?.effect ?? []).map((item) => ({
    kind: "effect",
    id: item.id ?? null,
    name: item.name ?? null,
    img: item.img ?? null,
    slug: item.slug ?? null,
    badge: item.badge?.value ?? item.system?.badge?.value ?? null,
    duration: jsonSafe(item.system?.duration ?? null)
  }));
  const activeEffects = (actor.effects?.contents ?? []).map((effect) => ({
    kind: "activeEffect",
    id: effect.id ?? null,
    name: effect.name ?? null,
    img: effect.img ?? null,
    disabled: Boolean(effect.disabled),
    duration: jsonSafe(effect.duration?.toObject?.() ?? effect.duration ?? null)
  }));
  return [...items, ...activeEffects];
}

function groupEntries(combat) {
  return (combat.groups?.contents ?? []).map((group) => ({
    id: group.id ?? null,
    name: group.name ?? null,
    initiative: group.initiative ?? null,
    defeated: Boolean(group.defeated),
    hidden: Boolean(group.hidden),
    memberIds: listOf(group.members).map((member) => member.id)
  }));
}
