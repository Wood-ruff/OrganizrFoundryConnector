import { test } from "node:test";
import assert from "node:assert/strict";
import { combatErrorKey, combatEvent, combatPayload, combatantState, combatantsOfActor, isStatusDocument, moveActionOf } from "../scripts/service/CombatPayload.mjs";

const world = { id: "w", title: "World", coreVersion: "14.369", systemId: "pf2e", systemVersion: "8.6.0" };

function pf2eActor() {
  return {
    id: "A1", uuid: "Actor.A1", type: "npc", name: "Goblin Warrior", isToken: true,
    flags: { "organizr-foundry-connector": { sheet: { fileId: 5 } } },
    level: 1, alliance: "opposition",
    hitPoints: { value: 4, max: 15, temp: 0, unrecoverable: 0, negativeHealing: false },
    system: { attributes: { hp: { value: 4, max: 15 }, ac: { value: 16 }, speed: { value: 25, total: 25 } }, details: { level: { value: 1 } } },
    saves: { fortitude: { mod: 7 }, reflex: { mod: 5 }, will: { mod: 3 } },
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
    system: {
      attributes: { hp: { value: 30, max: 32, temp: 5 }, ac: { value: 18 }, movement: { walk: 30 } },
      abilities: { con: { save: 4 }, dex: { save: { value: 6 } }, wis: { save: "n/a" } },
      details: { level: { value: 3 } }
    },
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
  assert.equal(goblin.actor.speed, 25);
  assert.deepEqual(goblin.actor.saves, { fortitude: 7, reflex: 5, will: 3 });
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
  assert.equal(mara.actor.speed, 30);
  assert.deepEqual(mara.actor.saves, { fortitude: 4, reflex: 6, will: null });
  assert.deepEqual(mara.actor.conditions, []);
  assert.deepEqual(mara.actor.effects, [{ kind: "activeEffect", id: "ae1", name: "Blessed", img: "x.webp", disabled: false, statuses: [], duration: { rounds: 10 } }]);
  assert.deepEqual(mara.actor.traits, []);
});

function exhaustedActor(level) {
  const exhaustion = { id: "dnd5eexhaustion0", name: `Exhaustion (${level})`, img: "e.svg", disabled: false, statuses: new Set(["exhaustion"]), duration: {} };
  return {
    id: "A5", uuid: "Actor.A5", type: "character", name: "Tamsin", flags: {},
    system: { attributes: { hp: { value: 20, max: 24 }, ac: { value: 15 }, exhaustion: level }, details: { level: 4 } },
    statuses: new Set(level > 0 ? ["exhaustion"] : []),
    effects: { contents: level > 0 ? [exhaustion] : [] }
  };
}

const dnd5eWorld = { ...world, systemId: "dnd5e", systemVersion: "6.0.6" };

test("a dnd5e combatant carries its exhaustion level as a condition and the status ids of its effects", () => {
  const payload = combatPayload(combatWith([exhaustedActor(2)]), dnd5eWorld, { type: "start", direction: 1 });
  const actor = payload.combatants[0].actor;
  assert.deepEqual(actor.statuses, ["exhaustion"]);
  assert.deepEqual(actor.conditions, [{ slug: "exhaustion", name: "Exhaustion", value: 2 }]);
  assert.equal(actor.effects[0].id, "dnd5eexhaustion0");
  assert.deepEqual(actor.effects[0].statuses, ["exhaustion"]);
});

test("a dnd5e combatant without exhaustion carries no condition", () => {
  const payload = combatPayload(combatWith([exhaustedActor(0)]), dnd5eWorld, { type: "start", direction: 1 });
  assert.deepEqual(payload.combatants[0].actor.conditions, []);
});

test("the exhaustion level only becomes a condition in a dnd5e world", () => {
  const payload = combatPayload(combatWith([exhaustedActor(2)]), world, { type: "start", direction: 1 });
  assert.deepEqual(payload.combatants[0].actor.conditions, []);
});

test("combatantState reads the exhaustion level in the system it is given", () => {
  const combat = combatWith([exhaustedActor(3)]);
  const combatant = { ...combat.turns[0], parent: combat };
  assert.deepEqual(combatantState(combatant, { type: "state", direction: 0 }, "dnd5e").actor.conditions,
    [{ slug: "exhaustion", name: "Exhaustion", value: 3 }]);
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

test("status documents are active effects, pf2e condition/effect items and pf1 buffs", () => {
  assert.equal(isStatusDocument("ActiveEffect", undefined), true);
  assert.equal(isStatusDocument("Item", "condition"), true);
  assert.equal(isStatusDocument("Item", "effect"), true);
  assert.equal(isStatusDocument("Item", "buff"), true);
  assert.equal(isStatusDocument("Item", "weapon"), false);
  assert.equal(isStatusDocument("Actor", "npc"), false);
});

function unlinkedCombatant(id, tokenId, baseId) {
  return {
    id,
    actor: { id: baseId, uuid: `Scene.S.Token.${tokenId}.Actor.${baseId}`, isToken: true },
    token: { id: tokenId, actorId: baseId, actorLink: false }
  };
}

function combatantIds(combatants) {
  return combatants.map((combatant) => combatant.id);
}

const mixedCombatants = [
  { id: "c0", actor: { id: "A1", uuid: "Actor.A1", isToken: false }, token: { id: "t0", actorId: "A1", actorLink: true } },
  unlinkedCombatant("c1", "t1", "B1"),
  unlinkedCombatant("c2", "t2", "B1"),
  unlinkedCombatant("c3", "t3", "B2"),
  { id: "c4", actor: null, token: null }
];

test("combatantsOfActor finds a linked actor's combatant by uuid", () => {
  assert.deepEqual(combatantIds(combatantsOfActor(mixedCombatants, { id: "A1", uuid: "Actor.A1", isToken: false })), ["c0"]);
  assert.deepEqual(combatantIds(combatantsOfActor(new Set(mixedCombatants), { id: "A1", uuid: "Actor.A1" })), ["c0"]);
});

test("a base actor's change reaches every unlinked combatant made from it", () => {
  const base = { id: "B1", uuid: "Actor.B1", isToken: false };
  assert.deepEqual(combatantIds(combatantsOfActor(mixedCombatants, base)), ["c1", "c2"]);
});

test("a token actor's change reaches only its own combatant", () => {
  const tokenActor = { id: "B1", uuid: "Scene.S.Token.t2.Actor.B1", isToken: true };
  assert.deepEqual(combatantIds(combatantsOfActor(mixedCombatants, tokenActor)), ["c2"]);
});

test("combatantsOfActor finds nothing for another base actor, a missing uuid or no combatants", () => {
  assert.deepEqual(combatantsOfActor(mixedCombatants, { id: "B9", uuid: "Actor.B9", isToken: false }), []);
  assert.deepEqual(combatantsOfActor(mixedCombatants, { id: "B1", isToken: false }), []);
  assert.deepEqual(combatantsOfActor(mixedCombatants, null), []);
  assert.deepEqual(combatantsOfActor(undefined, { id: "B1", uuid: "Actor.B1" }), []);
});

function pf1Character() {
  return {
    id: "P1", uuid: "Actor.P1", type: "character", name: "Tamsin Reedwater",
    flags: { "organizr-foundry-connector": { sync: { characterFileId: 31, documentUuid: "Actor.P1" } } },
    system: {
      attributes: {
        hp: { value: 20, max: 42, temp: 0 },
        ac: { normal: { total: 17 }, touch: { total: 13 }, flatFooted: { total: 15 } },
        speed: { land: { total: 40 } },
        savingThrows: { fort: { total: 5 }, ref: { total: 3 }, will: { total: 4 } }
      },
      details: { level: { value: 4 } }
    },
    statuses: new Set(),
    itemTypes: {
      buff: [
        { id: "b1", name: "Inspired Courage", img: "buff.webp", system: { active: true, duration: { value: "5", units: "round" } } },
        { id: "b2", name: "Shield of Faith", img: "sof.webp", system: { active: false, duration: { value: "1", units: "minute" } } }
      ]
    },
    effects: { contents: [] }
  };
}

test("a pf2e 8 actor's speed is its derived land speed under movement", () => {
  const actor = pf2eActor();
  delete actor.system.attributes.speed;
  actor.system.movement = { speeds: { land: { value: 20, base: 25 }, fly: null } };
  const [entry] = combatPayload(combatWith([actor]), world, { type: "start", direction: 1 }).combatants;
  assert.equal(entry.actor.speed, 20);
});

test("a pf1 actor's ac is its normal ac total", () => {
  const [entry] = combatPayload(combatWith([pf1Character()]), world, { type: "start", direction: 1 }).combatants;
  assert.equal(entry.actor.ac, 17);
  assert.equal(entry.actor.speed, 40);
  assert.deepEqual(entry.actor.saves, { fortitude: 5, reflex: 3, will: 4 });
});

test("active pf1 buffs are listed as effects, inactive ones are not", () => {
  const [entry] = combatPayload(combatWith([pf1Character()]), world, { type: "start", direction: 1 }).combatants;
  assert.deepEqual(entry.actor.effects, [
    { kind: "effect", id: "b1", name: "Inspired Courage", img: "buff.webp", slug: null, badge: null, duration: { value: "5", units: "round" } }
  ]);
});

test("the combat file id ignores a flag copied from another actor", () => {
  const copy = { ...pf1Character(), id: "P2", uuid: "Actor.P2" };
  const [original, duplicate] = combatPayload(combatWith([pf1Character(), copy]), world, { type: "start", direction: 1 }).combatants;
  assert.equal(original.actor.organizrFileId, 31);
  assert.equal(duplicate.actor.organizrFileId, null);
});

function dnd5eActor(type, details, walk) {
  return {
    id: `D${type}`, uuid: `Actor.D${type}`, type, name: `Ashveil ${type}`, flags: {},
    system: {
      attributes: { hp: { value: 22, max: 40, temp: 3 }, ac: { value: 17 }, movement: { speeds: { walk, fly: 60 }, walk: walk + 5 } },
      abilities: { con: { save: { value: 3 } }, dex: { save: { value: 0 } }, wis: { save: { value: -2 } } },
      details
    },
    statuses: new Set(),
    effects: { contents: [] }
  };
}

test("a dnd5e npc has no level, its challenge rating and its derived walk speed", () => {
  const [entry] = combatPayload(combatWith([dnd5eActor("npc", { level: 0, cr: 5 }, 30)]), world, { type: "start", direction: 1 }).combatants;
  assert.equal(entry.actor.level, null);
  assert.equal(entry.actor.cr, 5);
  assert.equal(entry.actor.speed, 30);
  assert.deepEqual(entry.actor.saves, { fortitude: 3, reflex: 0, will: -2 });
});

test("a dnd5e character has its total level, no challenge rating and its derived walk speed", () => {
  const [entry] = combatPayload(combatWith([dnd5eActor("character", { level: 5 }, 25)]), world, { type: "start", direction: 1 }).combatants;
  assert.equal(entry.actor.level, 5);
  assert.equal(entry.actor.cr, null);
  assert.equal(entry.actor.speed, 25);
});

test("a fractional challenge rating stays and a dnd5e actor without speeds falls back to the older walk", () => {
  const actor = dnd5eActor("npc", { level: 0, cr: 0.25 }, 30);
  actor.system.attributes.movement = { walk: 40 };
  const [entry] = combatPayload(combatWith([actor]), world, { type: "start", direction: 1 }).combatants;
  assert.equal(entry.actor.cr, 0.25);
  assert.equal(entry.actor.speed, 40);
});

test("pf2e and pf1 actors keep their levels and carry no challenge rating", () => {
  const pf1Npc = pf1Character();
  pf1Npc.system.details.cr = { base: 3, total: 3 };
  const [goblin, tamsin] = combatPayload(combatWith([pf2eActor(), pf1Npc]), world, { type: "start", direction: 1 }).combatants;
  assert.equal(goblin.actor.level, 1);
  assert.equal(goblin.actor.cr, null);
  assert.equal(tamsin.actor.level, 4);
  assert.equal(tamsin.actor.cr, null);
});
