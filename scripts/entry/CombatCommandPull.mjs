import { ackBody, actorCommandState, commandOperation } from "../service/CombatCommands.mjs";
import { combatErrorKey, combatantState } from "../service/CombatPayload.mjs";
import { MODULE_ID, readWorldLink } from "../config/ModuleSettings.mjs";
import { createOrganizrClient } from "../client/OrganizrClient.mjs";
import { noteAppliedCommands } from "./CombatSync.mjs";

const organizr = createOrganizrClient();
let polling = false;
let pausedForStart = null;

/** Fetches and applies the commands Organizr queued for the synced combat; called once after every turn or round move. */
export async function pullCommands() {
  if (!isPaused()) await pollOnce();
}

function isPaused() {
  return pausedForStart !== null && pausedForStart === currentStart();
}

function currentStart() {
  return game.combat?.getFlag(MODULE_ID, "sync")?.startedAt ?? null;
}

async function pollOnce() {
  if (polling) return;
  polling = true;
  try {
    const commands = await organizr.listCombatCommands(readWorldLink());
    if (Array.isArray(commands) && commands.length > 0) await handleCommands(commands);
  } catch (error) {
    if (error.status === 404 || error.status === 0) pausedForStart = currentStart();
    ui.notifications.error(combatErrorKey(error.status ?? -1), { localize: true, format: { message: error.message } });
  } finally {
    polling = false;
  }
}

async function handleCommands(commands) {
  const results = [];
  for (const command of commands) results.push(await applyCommand(command));
  await organizr.ackCombatCommands(readWorldLink(), ackBody(results));
}

async function applyCommand(command) {
  const combatant = game.combat?.combatants.get(command.combatantId) ?? null;
  if (!combatant?.actor) return { id: command.id, ok: false, error: "no combatant with that id" };
  const state = actorCommandState(combatantState(combatant, { type: "command", direction: 0 }).actor);
  const operation = commandOperation(command, state);
  try {
    await runOperation(combatant.actor, operation);
  } catch (error) {
    return { id: command.id, ok: false, error: error.message };
  }
  noteAppliedCommands(combatant.id, [command.id]);
  return { id: command.id, ok: true, error: operation.op === "skip" ? operation.reason : null };
}

async function runOperation(actor, operation) {
  if (operation.op === "setCondition") return setCondition(actor, operation);
  if (operation.op === "removeCondition") return removeCondition(actor, operation);
  if (operation.op === "removeEffect") return removeEffect(actor, operation);
  if (operation.op === "setStatus") return actor.toggleStatusEffect(operation.slug, { active: operation.active });
}

async function setCondition(actor, { slug, value }) {
  if (typeof actor.increaseCondition !== "function") return actor.toggleStatusEffect(slug, { active: true });
  if (value !== null) return actor.increaseCondition(slug, { value });
  if (!actor.hasCondition(slug)) return actor.toggleCondition(slug);
}

async function removeCondition(actor, { slug }) {
  if (typeof actor.decreaseCondition === "function" && actor.hasCondition(slug)) {
    return actor.decreaseCondition(slug, { forceRemove: true });
  }
  return actor.toggleStatusEffect(slug, { active: false });
}

async function removeEffect(actor, { kind, id }) {
  const document = kind === "activeEffect" ? actor.effects.get(id) : actor.items.get(id);
  if (document) await document.delete();
}
