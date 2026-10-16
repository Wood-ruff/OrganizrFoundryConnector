import { test } from "node:test";
import assert from "node:assert/strict";
import { combatErrorKey, combatEvent, combatPayload, combatantOfActor, combatantState, isStatusDocument, moveActionOf } from "../scripts/service/CombatPayload.mjs";

const world = { id: "w", title: "World", coreVersion: "14.369", systemId: "pf2e", systemVersion: "8.6.0" };

function pf2eActor() {
  return {
    id: "A1", uuid: "Actor.A1", type: "npc", name: "Goblin Warrior", isToken: true,
    flags: { "organizr-foundry-connector": { sheet: { fileId: 5 } } },
    level: 1, alliance: "opposition",
    hitPoints: { value: 4, max: 15, temp: 0, unrecoverable: 0, negativeHealing: false },
    system: { attributes: { hp: { value: 4, max: 15 }, ac: { value: 16 } }, details: { level: { value: 1 } } },
    statuses: new Set(["frightened"]),
    conditions: { active: [{ slug: "frightened", name: "Frightened", value: 1 }] },
    itemTypes: { effect: [{ id: "e1", name: "Effect: Bless", img: "b.webp", slug: "effect-bless", badge: { value: 2 }, system: { duration: { value: 1, unit: "minutes" } } }] },
    effects: { contents: [] },
    traits: new Set(["goblin", "humanoid"])
  };
}

function plainActor() {
  return {
    id: "A2", uuid: "Actor.A2", type: "character", name: "Mara", flags: {},
    system: { attributes: { hp: { value: 30, max: 32, temp: 5 }, ac: { value: 18 } }, details: { level: { value: 3 } } },
    statuses: new Set(),
    effects: { contents: [{ id: "ae1", name: "Blessed", img: "x.webp", disabled: false, duration: { toObject: () => ({ rounds: 10 }) } }] }
  };
}

function combatWith(actors) {
  const combatants = actors.map((actor, index) => ({
    id: `c${index}`, name: actor.name, img: "i.webp", initiative: 20 - index, defeated: false, hidden: index === 1,
    isNPC: actor.type === "npc", roundJoined: 1, group: index === 0 ? "g1" : null,
    players: actor.type === "character" ? [{ name: "Alice" }] : [],
    token: { id: `t${index}`, uuid: `Scene.S.Token.t${index}`, name: actor.name, x: 100, y: 200, elevation: 0, width: 1, height: 1, disposition: -1, hidden: false, actorLink: actor.type === "character" },
    actor
  }));
  return {
    id: "C1", uuid: "Combat.C1", name: null, scene: { id: "S", name: "Cave" }, active: true, started: true, round: 2, turn: 0,
    combatant: combatants[0], nextCombatant: combatants[1], turns: combatants,
    groups: { contents: [{ id: "g1", name: "Goblins", initiative: 20, defeated: false, hidden: false, members: new Set([combatants[0]]) }] },
    metrics: { threat: "moderate", budget: { spent: 60, max: 80, partyLevel: 3 }, award: { xp: 60, recipients: [actors[1]] }, participants: { party: [actors[1]], opposition: [actors[0]] } }
  };
}

test("the payload carries event, world, combat state, groups and pf2e metrics as ids", () => {
  const payload = combatPayload(combatWith([pf2eActor(), plainActor()]), world, { type: "start", direction: 1 });
  assert.equal(payload.event.type, "start");
  assert.ok(payload.event.at);
  assert.equal(payload.world, world);
  assert.deepEqual(payload.combat, {
    id: "C1", uuid: "Combat.C1", name: null, scene: { id: "S", name: "Cave" }, active: true, started: true, round: 2, turn: 0,
    currentCombatantId: "c0", nextCombatantId: "c1",
    metrics: {
      threat: "moderate", budget: { spent: 60, max: 80, partyLevel: 3 },
      award: { xp: 60, recipientIds: ["A2"] }, participants: { partyIds: ["A2"], oppositionIds: ["A1"] }
    }
  });
  assert.deepEqual(payload.groups, [{ id: "g1", name: "Goblins", initiative: 20, defeated: false, hidden: false, memberIds: ["c0"] }]);
});

test("combatants carry turn order, token and the live actor state in both pf2e and generic shape", () => {
  const payload = combatPayload(combatWith([pf2eActor(), plainActor()]), world, { type: "turn", direction: 1 });
  const [goblin, mara] = payload.combatants;

  assert.equal(goblin.turnIndex, 0);
  assert.equal(goblin.isCurrent, true);
  assert.equal(goblin.npc, true);
  assert.equal(goblin.groupId, "g1");
  assert.deepEqual(goblin.players, []);
  assert.equal(goblin.token.uuid, "Scene.S.Token.t0");
  assert.equal(goblin.actor.organizrFileId, 5);
  assert.deepEqual(goblin.actor.hp, { value: 4, max: 15, temp: 0, unrecoverable: 0 });
  assert.equal(goblin.actor.ac, 16);
  assert.deepEqual(goblin.actor.statuses, ["frightened"]);
  assert.deepEqual(goblin.actor.conditions, [{ slug: "frightened", name: "Frightened", value: 1 }]);
  assert.deepEqual(goblin.actor.effects, [{ kind: "effect", id: "e1", name: "Effect: Bless", img: "b.webp", slug: "effect-bless", badge: 2, duration: { value: 1, unit: "minutes" } }]);
  assert.deepEqual(goblin.actor.traits, ["goblin", "humanoid"]);
  assert.equal(goblin.actor.alliance, "opposition");

  assert.equal(mara.hidden, true);
  assert.deepEqual(mara.players, ["Alice"]);
  assert.equal(mara.actor.organizrFileId, null);
  assert.equal(mara.actor.level, 3);
  assert.deepEqual(mara.actor.hp, { value: 30, max: 32, temp: 5, unrecoverable: 0 });
  assert.deepEqual(mara.actor.conditions, []);
  assert.deepEqual(mara.actor.effects, [{ kind: "activeEffect", id: "ae1", name: "Blessed", img: "x.webp", disabled: false, duration: { rounds: 10 } }]);
  assert.deepEqual(mara.actor.traits, []);
});

test("a combatant without token or actor and a combat without extras still produce a payload", () => {
  const combat = { id: "C2", turns: [{ id: "c9", name: "Ghost" }], combatant: null, round: 0 };
  const payload = combatPayload(combat, world, { type: "preview", direction: 0 });
  assert.equal(payload.combat.started, false);
  assert.equal(payload.combat.scene, null);
  assert.equal(payload.combat.metrics, null);
  assert.deepEqual(payload.groups, []);
  assert.equal(payload.combatants[0].token, null);
  assert.equal(payload.combatants[0].actor, null);
  assert.equal(payload.combatants[0].isCurrent, false);
});

test("non-iterable statuses, traits, conditions or members become empty lists instead of throwing", () => {
  const actor = { id: "A3", statuses: { odd: true }, traits: "goblin", conditions: { active: 5 }, system: {} };
  const combat = { id: "C3", turns: [{ id: "c0", actor }], groups: { contents: [{ id: "g", members: null }] } };
  const payload = combatPayload(combat, world, { type: "preview", direction: 0 });
  assert.deepEqual(payload.combatants[0].actor.statuses, []);
  assert.deepEqual(payload.combatants[0].actor.traits, []);
  assert.deepEqual(payload.combatants[0].actor.conditions, []);
  assert.deepEqual(payload.groups[0].memberIds, []);
});

test("combatEvent tells start, round and turn moves apart with their direction", () => {
  assert.deepEqual(combatEvent({ round: 0, turn: null }, { round: 1, turn: 0 }), { type: "start", direction: 1 });
  assert.deepEqual(combatEvent({ round: 1, turn: 2 }, { round: 2, turn: 0 }), { type: "round", direction: 1 });
  assert.deepEqual(combatEvent({ round: 2, turn: 0 }, { round: 1, turn: 2 }), { type: "round", direction: -1 });
  assert.deepEqual(combatEvent({ round: 1, turn: 0 }, { round: 1, turn: 1 }), { type: "turn", direction: 1 });
  assert.deepEqual(combatEvent({ round: 1, turn: 1 }, { round: 1, turn: 0 }), { type: "turn", direction: -1 });
  assert.deepEqual(combatEvent({ round: 1, turn: 1 }, { round: 1, turn: 1 }), { type: "update", direction: 0 });
  assert.deepEqual(combatEvent(undefined, { round: 1, turn: 0 }), { type: "start", direction: 1 });
});

test("a turn index shift that keeps the same combatant current is no move", () => {
  const shifted = combatEvent({ round: 2, turn: 3, combatantId: "c3" }, { round: 2, turn: 2, combatantId: "c3" });
  assert.deepEqual(shifted, { type: "update", direction: 0 });
  const real = combatEvent({ round: 2, turn: 2, combatantId: "c2" }, { round: 2, turn: 3, combatantId: "c3" });
  assert.deepEqual(real, { type: "turn", direction: 1 });
  const newRound = combatEvent({ round: 1, turn: 3, combatantId: "c3" }, { round: 2, turn: 0, combatantId: "c0" });
  assert.deepEqual(newRound, { type: "round", direction: 1 });
});

test("combat error keys by status", () => {
  assert.equal(combatErrorKey(0), "ORGANIZR.Combat.Errors.Unreachable");
  assert.equal(combatErrorKey(401), "ORGANIZR.Combat.Errors.TokenRejected");
  assert.equal(combatErrorKey(403), "ORGANIZR.Combat.Errors.WrongProject");
  assert.equal(combatErrorKey(404), "ORGANIZR.Combat.Errors.NotFound");
  assert.equal(combatErrorKey(409), "ORGANIZR.Combat.Errors.AlreadyRunning");
  assert.equal(combatErrorKey(500), "ORGANIZR.Combat.Errors.ServerError");
});

test("combatantState is the combatant's payload entry with a state event", () => {
  const combat = combatWith([pf2eActor(), plainActor()]);
  const combatant = { ...combat.turns[1], parent: combat };
  const state = combatantState(combatant, { type: "state", direction: 0 });
  assert.equal(state.event.type, "state");
  assert.ok(state.event.at);
  assert.equal(state.id, "c1");
  assert.equal(state.turnIndex, 1);
  assert.equal(state.isCurrent, false);
  assert.deepEqual(state.actor.hp, { value: 30, max: 32, temp: 5, unrecoverable: 0 });
});

test("moveActionOf maps turn and round events to Organizr's move actions", () => {
  assert.equal(moveActionOf({ type: "turn", direction: 1 }), "next-turn");
  assert.equal(moveActionOf({ type: "turn", direction: -1 }), "previous-turn");
  assert.equal(moveActionOf({ type: "round", direction: 1 }), "next-round");
  assert.equal(moveActionOf({ type: "round", direction: -1 }), "previous-round");
  assert.equal(moveActionOf({ type: "start", direction: 1 }), null);
  assert.equal(moveActionOf({ type: "update", direction: 0 }), null);
  assert.equal(moveActionOf(undefined), null);
});

test("status documents are active effects and pf2e condition/effect items", () => {
  assert.equal(isStatusDocument("ActiveEffect", undefined), true);
  assert.equal(isStatusDocument("Item", "condition"), true);
  assert.equal(isStatusDocument("Item", "effect"), true);
  assert.equal(isStatusDocument("Item", "weapon"), false);
  assert.equal(isStatusDocument("Actor", "npc"), false);
});

test("combatantOfActor finds the combatant by actor uuid", () => {
  const combatants = [{ id: "c0", actor: { uuid: "Actor.A1" } }, { id: "c1", actor: { uuid: "Scene.S.Token.t1.Actor.A1" } }, { id: "c2", actor: null }];
  assert.equal(combatantOfActor(combatants, { uuid: "Scene.S.Token.t1.Actor.A1" }).id, "c1");
  assert.equal(combatantOfActor(combatants, { uuid: "Actor.Zz" }), null);
  assert.equal(combatantOfActor(combatants, null), null);
  assert.equal(combatantOfActor(new Set(combatants), { uuid: "Actor.A1" }).id, "c0");
});
