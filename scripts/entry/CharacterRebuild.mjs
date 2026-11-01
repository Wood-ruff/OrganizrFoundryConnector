import { MODULE_ID } from "../config/ModuleId.mjs";
import { actorSeed } from "../service/Pf2eActorSeed.mjs";
import {
  actorStateUpdate, isUsedUp, keptRootId, playStateItemUpdates, snapshotPlayState
} from "../service/BuiltPlayState.mjs";
import { actorBuildId, rootIdsToDelete, strayKeyUpdates } from "../service/BuiltRoots.mjs";
import { PENDING_REBUILD_FLAG, pendingSnapshot, recordedSnapshot } from "../service/PlayStateRecord.mjs";
import { actorRefreshUpdate } from "../service/Pf2eActorRefresh.mjs";
import { emptyWritten } from "./CharacterBuildWrites.mjs";
import { buildReport, writeWithPrompts } from "./CharacterBuildSteps.mjs";
import { PLANNED_SHARE, planBuild, seedPlanOf } from "./CharacterBuildPlan.mjs";
import { postBuildReport } from "./BuildReport.mjs";
import { buildError } from "./BuildErrors.mjs";

/**
 * Rebuilds a linked actor in place: takes the play state an unfinished rebuild recorded on the actor, else a new
 * snapshot, and plans (a failure here changes nothing). Then records the snapshot on the actor, turns kept items that
 * carry another root's key into plain Foundry items, deletes the build's roots with everything they grant, writes the
 * build again with the roots' previous ids, restores the kept state and clears the record. A failure after that restores what it can, keeps the record for the next import, posts the report
 * of what was written and throws RefreshFailed. Without `restoreInventory` the coins stay and used-up gear stays gone.
 */
export async function rebuildActor(actor, document, recipe, { notice, restoreInventory }) {
  const current = actor.toObject();
  const keepCoins = !restoreInventory;
  const recorded = pendingSnapshot(current);
  const snapshot = recorded ?? snapshotPlayState(current, { keepCoins });
  const buildId = actorBuildId(current) ?? foundry.utils.randomID();
  const plan = await planRefresh(recipe, snapshot, { buildId, restoreInventory });
  notice.advance(PLANNED_SHARE);
  const outcome = { prompts: [] };
  const written = emptyWritten();
  try {
    if (!recorded) await actor.setFlag(MODULE_ID, PENDING_REBUILD_FLAG, recordedSnapshot(snapshot));
    await clearStrayKeys(actor, strayKeyUpdates(current, { keepCoins }));
    await actor.deleteEmbeddedDocuments("Item", rootIdsToDelete(current, { keepCoins }), { render: false });
    await actor.update(actorRefreshUpdate(actorSeed(document, recipe, seedPlanOf(plan)), current));
    await writeWithPrompts(actor, recipe, plan, { outcome, written, previous: snapshot.choices });
    await restorePlayState(actor, snapshot, restoreInventory);
    await actor.unsetFlag(MODULE_ID, PENDING_REBUILD_FLAG);
    return { actor, report: buildReport(actor, recipe, plan, outcome.prompts, written, true) };
  } catch (error) {
    console.error("Organizr connector: character refresh failed", error);
    await restoreAfterFailure(actor, snapshot, restoreInventory);
    await postPartialReport(actor, recipe, plan, { prompts: outcome.prompts, written, error });
    throw buildError("ORGANIZR.Build.Errors.RefreshFailed", { name: actor.name, message: error.message });
  }
}

/**
 * The build plan of a refresh: roots take their previous ids and, unless the inventory is restored, gear used up in
 * Foundry is not created again and the coins stay. Any failure is reported before anything changes.
 */
async function planRefresh(recipe, snapshot, { buildId, restoreInventory }) {
  try {
    const plan = await planBuild(recipe, buildId);
    return {
      ...plan,
      keptId: (key) => keptRootId(snapshot, key),
      skipsGear: (key) => !restoreInventory && isUsedUp(snapshot, key),
      keepsCoins: !restoreInventory
    };
  } catch (error) {
    if (error.buildKey) throw error;
    console.error("Organizr connector: character refresh plan failed", error);
    throw buildError("ORGANIZR.Build.Errors.Failed", { name: recipe?.name ?? "", message: error.message });
  }
}

async function clearStrayKeys(actor, updates) {
  if (updates.length > 0) await actor.updateEmbeddedDocuments("Item", updates, { render: false });
}

/** Puts kept items and roots back into their containers, then the kept item, spell, slot and actor values. */
async function restorePlayState(actor, snapshot, restoreInventory) {
  const sources = actor.items.map((item) => item.toObject());
  const updates = playStateItemUpdates(snapshot, sources, restoreInventory);
  if (updates.length > 0) await actor.updateEmbeddedDocuments("Item", updates, { render: false });
  await actor.update(actorStateUpdate(snapshot, actor.hitPoints?.max, actor.system?.resources?.focus?.max));
}

/** Gives what the failed rebuild already wrote its kept values; a failure here is logged only. */
async function restoreAfterFailure(actor, snapshot, restoreInventory) {
  try {
    await restorePlayState(actor, snapshot, restoreInventory);
  } catch (restoreError) {
    console.warn("Organizr connector: the failed rebuild's play state was not restored", restoreError);
  }
}

async function postPartialReport(actor, recipe, plan, { prompts, written, error }) {
  try {
    const report = buildReport(actor, recipe, plan, prompts, written, true);
    report.notes.push(error.message);
    await postBuildReport(report);
  } catch (reportError) {
    console.warn("Organizr connector: the partial rebuild's report was not posted", reportError);
  }
}
