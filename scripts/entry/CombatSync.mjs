import { combatErrorKey, combatPayload, combatantState, moveActionOf } from "../service/CombatPayload.mjs";
import { diffState, hasChanges, stateSnapshot } from "../service/StateDiff.mjs";
import { isWorldLinked } from "../service/WorldLink.mjs";
import { MODULE_ID, readWorldLink } from "../config/ModuleSettings.mjs";
import { worldInfo } from "../config/WorldInfo.mjs";
import { createOrganizrClient } from "../client/OrganizrClient.mjs";
import { createKeyedDebounce } from "../util/KeyedDebounce.mjs";

const STATE_DELAY_MS = 600;

const organizr = createOrganizrClient();
const stateQueue = createKeyedDebounce((combat, combatant) => sendState(combat, combatant), STATE_DELAY_MS);
const baselines = new Map();
const appliedCommands = new Map();
let statePaused = false;

/** True for the one GM client that should talk to Organizr on behalf of the world. */
export function isActiveGM() {
  if (!game.user.isGM) return false;
  const activeGM = game.users.activeGM ?? game.user;
  return activeGM.id === game.user.id;
}

/** Whether this combat was started in Organizr through the current world link, so moves and state should follow. */
export function isSyncedCombat(combat) {
  const flag = combat?.getFlag(MODULE_ID, "sync") ?? null;
  const link = readWorldLink();
  return Boolean(flag) && flag.serverUrl === link.serverUrl && flag.projectId === link.projectId && isWorldLinked(link);
}

/** Starts the combat in Organizr (start or manual event) and remembers that on the combat. */
export async function sendCombat(combat, event) {
  const link = readWorldLink();
  if (!isWorldLinked(link)) {
    ui.notifications.warn("ORGANIZR.Characters.Errors.NotLinked", { localize: true });
    return;
  }
  const payload = combatPayload(combat, worldInfo(), event);
  let result;
  try {
    result = await organizr.pushCombat(link, payload);
    await combat.setFlag(MODULE_ID, "sync", { serverUrl: link.serverUrl, projectId: link.projectId, startedAt: new Date().toISOString() });
  } catch (error) {
    ui.notifications.error(combatErrorKey(error.status ?? -1), { localize: true, format: { message: error.message } });
    return;
  }
  statePaused = false;
  rememberBaselines(payload.combatants);
  ui.notifications.info("ORGANIZR.Combat.Sent", { localize: true, format: { round: String(combat.round ?? 0) } });
  for (const note of result?.notes ?? []) ui.notifications.warn("ORGANIZR.Combat.Note", { localize: true, format: { note } });
}

/** Mirrors a turn or round move of a synced combat to Organizr; true when the move was accepted. */
export async function sendMove(combat, event) {
  const action = moveActionOf(event);
  if (!action) return false;
  try {
    await organizr.moveCombat(readWorldLink(), action);
  } catch (error) {
    ui.notifications.error(combatErrorKey(error.status ?? -1), { localize: true, format: { message: error.message } });
    return false;
  }
  return true;
}

/** Ends the synced combat in Organizr. */
export async function sendEnd() {
  stateQueue.cancelAll();
  baselines.clear();
  appliedCommands.clear();
  try {
    await organizr.endCombat(readWorldLink());
  } catch (error) {
    ui.notifications.error(combatErrorKey(error.status ?? -1), { localize: true, format: { message: error.message } });
  }
}

/** Queues a combatant state push; bursts of changes within the delay collapse into one request per combatant. */
export function queueState(combat, combatant) {
  if (statePaused) return;
  stateQueue.call(combatant.id, combat, combatant);
}

/** Remembers Organizr command ids applied to a combatant; the next state push reports them so the server can tell its own changes apart. */
export function noteAppliedCommands(combatantId, commandIds) {
  const ids = appliedCommands.get(combatantId) ?? new Set();
  for (const id of commandIds) ids.add(id);
  appliedCommands.set(combatantId, ids);
}

function rememberBaselines(entries) {
  baselines.clear();
  appliedCommands.clear();
  for (const entry of entries) baselines.set(entry.id, stateSnapshot(entry));
}

async function sendState(combat, combatant) {
  if (!combat.combatants.has(combatant.id)) return;
  const entry = combatantState(combatant, { type: "state", direction: 0 });
  const snapshot = stateSnapshot(entry);
  const changes = diffState(baselines.get(combatant.id), snapshot);
  if (!hasChanges(changes)) return;
  try {
    const appliedCommandIds = [...(appliedCommands.get(combatant.id) ?? [])];
    await organizr.pushCombatantState(readWorldLink(), combatant.id, { ...entry, changes, appliedCommandIds });
    baselines.set(combatant.id, snapshot);
    appliedCommands.delete(combatant.id);
    ui.notifications.info("ORGANIZR.Combat.StateSent", { localize: true, format: { name: combatant.name } });
  } catch (error) {
    if (error.status === 404 || error.status === 0) statePaused = true;
    ui.notifications.error("ORGANIZR.Combat.Errors.StateFailed", { localize: true, format: { name: combatant.name, message: error.message } });
  }
}
