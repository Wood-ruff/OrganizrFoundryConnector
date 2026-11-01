import { recipeErrorKey } from "../service/Pf2eRecipe.mjs";
import { appliesPortrait, withRequestedFileId } from "../service/SheetImport.mjs";
import { actorSeed, playStateUpdate } from "../service/Pf2eActorSeed.mjs";
import { readWorldLink } from "../config/ModuleSettings.mjs";
import { worldInfo } from "../config/WorldInfo.mjs";
import { createOrganizrClient } from "../client/OrganizrClient.mjs";
import { createSerialQueue } from "../util/SerialQueue.mjs";
import { buildError } from "./BuildErrors.mjs";
import { linkedCopy, recordLink, stampDocumentUuid, withStoredPortrait } from "./ImportSteps.mjs";
import { emptyWritten } from "./CharacterBuildWrites.mjs";
import { buildReport, writeWithPrompts } from "./CharacterBuildSteps.mjs";
import { PLANNED_SHARE, planBuild, seedPlanOf } from "./CharacterBuildPlan.mjs";
import { rebuildActor } from "./CharacterRebuild.mjs";
import { startBuildNotice } from "./BuildReport.mjs";

const NO_COMPANIONS = Object.freeze({ count: 0, failed: 0, folderName: null });

const organizr = createOrganizrClient();
const builds = createSerialQueue();

/**
 * Builds a pf2e character from its Organizr recipe: pf2e's own compendium items plus the linked sheets' exports for
 * what the compendium lacks, every choice prompt answered from the recipe. Plans first (nothing is written when the
 * class has no single match), then creates the actor and its items; a failure after that removes the actor. A world
 * copy already linked to the sheet is rebuilt in place instead, keeping its play state (`restoreInventory` takes
 * Organizr's quantities and coins). Builds run one at a time, in call order. Returns importSheet's shape plus `build`
 * (the build report); warnings are localization keys.
 */
export function importCharacterBuild(fileId, options = {}) {
  return builds.run(() => buildCharacter(fileId, options));
}

async function buildCharacter(fileId, { recordedUuid = null, restoreInventory = false }) {
  const link = readWorldLink();
  const world = worldInfo();
  const warnings = [];
  const { document: data, recipe } = await fetchRecipe(link, fileId, world.systemId);
  const document = appliesPortrait("Actor", data) ? await withStoredPortrait(data, link, warnings) : data;
  const { target, duplicates } = linkedCopy(fileId, "Actor", recordedUuid);
  const notice = startBuildNotice(recipe.name);
  let built;
  try {
    if (target) built = await rebuildActor(target, document, recipe, { notice, restoreInventory });
    else built = await buildNewActor(document, recipe, notice);
  } finally {
    notice.close();
  }
  await stampDocumentUuid(built.actor);
  await recordLink(link, fileId, built.actor, world, warnings);
  const { actor, report } = built;
  const companions = NO_COMPANIONS;
  const updated = Boolean(target);
  return { name: actor.name, uuid: actor.uuid, updated, warnings, duplicates, companions, build: report };
}

async function buildNewActor(document, recipe, notice) {
  const plan = await planBuild(recipe, foundry.utils.randomID());
  notice.advance(PLANNED_SHARE);
  return createBuiltActor(document, recipe, plan);
}

/** The recipe answer with the sheet flag naming the requested file; an unreadable recipe is refused before any work. */
async function fetchRecipe(link, fileId, systemId) {
  const payload = await organizr.fetchCharacterRecipe(link, fileId, systemId);
  const errorKey = recipeErrorKey(payload);
  if (errorKey) throw buildError(errorKey, { name: payload?.document?.name ?? `#${fileId}` });
  return { document: withRequestedFileId(payload.document, fileId), recipe: payload.recipe };
}

/** Creates the actor, writes its items while the choice prompts are answered, then sets the play state and reports. */
async function createBuiltActor(document, recipe, plan) {
  const seed = actorSeed(document, recipe, seedPlanOf(plan));
  const actor = await CONFIG.Actor.documentClass.create(seed, { renderSheet: false });
  if (!actor) throw buildError("ORGANIZR.Build.Errors.NotCreated", { name: document.name ?? "" });
  try {
    const report = await buildOnto(actor, recipe, plan);
    return { actor, report };
  } catch (error) {
    console.error("Organizr connector: character build failed", error);
    const removed = await removeActor(actor);
    const key = removed ? "ORGANIZR.Build.Errors.Failed" : "ORGANIZR.Build.Errors.FailedKept";
    throw buildError(key, { name: actor.name, message: error.message });
  }
}

async function buildOnto(actor, recipe, plan) {
  const outcome = { prompts: [] };
  const written = emptyWritten();
  await writeWithPrompts(actor, recipe, plan, { outcome, written, previous: new Map() });
  await actor.update(playStateUpdate(recipe, actor.hitPoints?.max, actor.system?.resources?.focus?.max));
  return buildReport(actor, recipe, plan, outcome.prompts, written, false);
}

/** Deletes the failed build's actor; false when the delete failed or was cancelled and the actor is still there. */
async function removeActor(actor) {
  try {
    const deleted = await actor.delete();
    return Boolean(deleted);
  } catch (error) {
    console.warn("Organizr connector: the failed build's actor was not removed", error);
    return false;
  }
}
