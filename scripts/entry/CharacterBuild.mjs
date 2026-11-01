import { recipeErrorKey, recipeEvidence } from "../service/Pf2eRecipe.mjs";
import { appliesPortrait, withRequestedFileId } from "../service/SheetImport.mjs";
import {
  classMatched, loadedKey, matchFindings, matchSources, neededPacks, packIdsOf, recipeMatches
} from "../service/Pf2eBuildMatches.mjs";
import { boostInput, boostPlan, manualReason } from "../service/Pf2eBoosts.mjs";
import { actorSeed, languageValues, playStateUpdate } from "../service/Pf2eActorSeed.mjs";
import { filledReport } from "../service/BuildReport.mjs";
import {
  actorStateUpdate, containerRestores, entrySlotUpdates, itemStateUpdates, keptRootId, rootIdsToDelete,
  snapshotPlayState, spellUseUpdates
} from "../service/BuiltPlayState.mjs";
import { actorRefreshUpdate } from "../service/Pf2eActorRefresh.mjs";
import { totalsDifferences } from "../service/TotalsCompare.mjs";
import { pf2eDerivedTotals } from "../service/Pf2eTotals.mjs";
import { totalsActor } from "../service/Pf2eTotalsActor.mjs";
import { readWorldLink } from "../config/ModuleSettings.mjs";
import { worldInfo } from "../config/WorldInfo.mjs";
import { createOrganizrClient } from "../client/OrganizrClient.mjs";
import { indexRows, packSources } from "../persistence/CompendiumIndex.mjs";
import { withChoicePrompts } from "./ChoicePrompts.mjs";
import { linkedCopy, recordLink, stampDocumentUuid, withStoredPortrait } from "./ImportSteps.mjs";
import { emptyWritten, writeBuildItems } from "./CharacterBuildWrites.mjs";
import { postBuildReport, startBuildNotice } from "./BuildReport.mjs";

const IDENTITY_KINDS = ["ancestry", "heritage", "background", "class", "deity"];
const NO_COMPANIONS = Object.freeze({ count: 0, failed: 0, folderName: null });
const PLANNED_SHARE = 0.4;

const organizr = createOrganizrClient();

/**
 * Builds a pf2e character from its Organizr recipe: pf2e's own compendium items plus the linked sheets' exports for
 * what the compendium lacks, every choice prompt answered from the recipe. Plans first (nothing is written when the
 * class has no single match), then creates the actor and its items; a failure after that removes the actor. A world
 * copy already linked to the sheet is rebuilt in place instead, keeping its play state (`restoreInventory` takes
 * Organizr's quantities and coins). Returns importSheet's shape plus `build` (the build report); warnings are
 * localization keys.
 */
export async function importCharacterBuild(fileId, { recordedUuid = null, restoreInventory = false } = {}) {
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
  const plan = await planBuild(recipe);
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

/**
 * Rebuilds a linked actor in place: snapshots its play state, plans (a failure here changes nothing), deletes the
 * build's roots with everything they grant, writes the build again with the roots' previous ids and then restores the
 * kept state. A failure after the delete posts the report of what was written and throws RefreshFailed.
 */
async function rebuildActor(actor, document, recipe, { notice, restoreInventory }) {
  const current = actor.toObject();
  const snapshot = snapshotPlayState(current);
  const plan = await planRefresh(recipe, snapshot);
  notice.advance(PLANNED_SHARE);
  const outcome = { prompts: [] };
  const written = emptyWritten();
  try {
    await actor.deleteEmbeddedDocuments("Item", rootIdsToDelete(current), { render: false });
    await actor.update(actorRefreshUpdate(refreshSeed(document, recipe, plan), current));
    await writeWithPrompts(actor, recipe, plan, { outcome, written, previous: snapshot.choices });
    await restorePlayState(actor, snapshot, restoreInventory);
    return { actor, report: buildReport(actor, recipe, plan, outcome.prompts, written, true) };
  } catch (error) {
    console.error("Organizr connector: character refresh failed", error);
    await postPartialReport(actor, recipe, plan, { prompts: outcome.prompts, written, error });
    throw buildError("ORGANIZR.Build.Errors.RefreshFailed", { name: actor.name, message: error.message });
  }
}

/** The build plan of a refresh, whose roots take their previous ids; any failure is reported before anything changes. */
async function planRefresh(recipe, snapshot) {
  try {
    const plan = await planBuild(recipe);
    return { ...plan, keptId: (key) => keptRootId(snapshot, key) };
  } catch (error) {
    if (error.buildKey) throw error;
    console.error("Organizr connector: character refresh plan failed", error);
    throw buildError("ORGANIZR.Build.Errors.Failed", { name: recipe?.name ?? "", message: error.message });
  }
}

function refreshSeed(document, recipe, plan) {
  return actorSeed(document, recipe, { boosts: plan.boosts, languages: plan.languages.value });
}

/** Puts kept contents back into their containers, then the kept item, spell, slot and actor values (within the new maxima). */
async function restorePlayState(actor, snapshot, restoreInventory) {
  const sources = actor.items.map((item) => item.toObject());
  const updates = [
    ...containerRestores(snapshot, sources.map((source) => source._id)),
    ...(restoreInventory ? [] : itemStateUpdates(snapshot, sources)),
    ...spellUseUpdates(snapshot, sources),
    ...entrySlotUpdates(snapshot, sources)
  ];
  if (updates.length > 0) await actor.updateEmbeddedDocuments("Item", updates, { render: false });
  await actor.update(actorStateUpdate(snapshot, actor.hitPoints?.max, actor.system?.resources?.focus?.max));
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

/**
 * Everything decided before a write: the compendium matches (the class must match once), the loaded and shaped item
 * sources by build key, the identity sources, the boost plan (null = manual attributes) and the language slugs.
 */
async function planBuild(recipe) {
  const sluggify = game.pf2e.system.sluggify;
  const rowsByPack = await indexedPacks(neededPacks(recipe));
  const matches = recipeMatches(recipe, rowsByPack, sluggify);
  if (!classMatched(matches)) {
    const className = recipe?.identity?.class?.name ?? "";
    throw buildError("ORGANIZR.Build.Errors.NoClass", { name: recipe?.name ?? "", className });
  }
  const sources = matchSources(matches, await loadedSources(packIdsOf(matches)));
  const identity = identitySources(matches, sources);
  const input = boostInput({
    recipe, ancestry: identity.ancestry, background: identity.background, cls: identity.class, gradual: gradualBoosts()
  });
  const boosts = boostPlan(input);
  const languages = languageValues(recipe.languages, languageLabels(), grantedLanguages(identity.ancestry), sluggify);
  return { matches, sources, identity, boosts, manual: manualReason(input, boosts), languages };
}

/** Creates the actor, writes its items while the choice prompts are answered, then sets the play state and reports. */
async function createBuiltActor(document, recipe, plan) {
  const seed = actorSeed(document, recipe, { boosts: plan.boosts, languages: plan.languages.value });
  const actor = await CONFIG.Actor.documentClass.create(seed, { renderSheet: false });
  try {
    const report = await buildOnto(actor, recipe, plan);
    return { actor, report };
  } catch (error) {
    console.error("Organizr connector: character build failed", error);
    await removeActor(actor);
    throw buildError("ORGANIZR.Build.Errors.Failed", { name: actor.name, message: error.message });
  }
}

async function buildOnto(actor, recipe, plan) {
  const outcome = { prompts: [] };
  const written = emptyWritten();
  await writeWithPrompts(actor, recipe, plan, { outcome, written, previous: new Map() });
  await actor.update(playStateUpdate(recipe, actor.hitPoints?.max, actor.system?.resources?.focus?.max));
  return buildReport(actor, recipe, plan, outcome.prompts, written, false);
}

/** Writes the build's items while every choice prompt is answered from the recipe and the previous selections. */
async function writeWithPrompts(actor, recipe, plan, { outcome, written, previous }) {
  const sluggify = game.pf2e.system.sluggify;
  const evidence = recipeEvidence(recipe, sluggify, previous);
  await withChoicePrompts(evidence, outcome, () => writeBuildItems(actor, recipe, plan, evidence, written));
}

function buildReport(actor, recipe, plan, prompts, written, updated) {
  return filledReport(actor.name, updated, {
    findings: matchFindings(plan.matches),
    unknownLanguages: plan.languages.unknown,
    unslotted: written.unslotted,
    attached: written.attached,
    prompts,
    itemSources: actor.items.map((item) => item.toObject()),
    manualAttributes: plan.manual,
    unspentBoosts: plan.boosts?.unspent ?? 0,
    differences: totalsDifferences(recipe.expected, pf2eDerivedTotals(totalsActor(actor))),
    notes: [...(recipe.notes ?? []), ...written.unplaced.map(unplacedNote)]
  });
}

async function indexedPacks(packIds) {
  const rows = await Promise.all(packIds.map((packId) => indexRows(packId)));
  return new Map(packIds.map((packId, index) => [packId, rows[index]]));
}

/** Every compendium source the matches need, one request per pack, by loadedKey. */
async function loadedSources(idsByPack) {
  const packs = [...idsByPack.entries()];
  const loaded = await Promise.all(packs.map(([packId, ids]) => packSources(packId, ids)));
  const sources = new Map();
  packs.forEach(([packId], index) => {
    for (const source of loaded[index]) sources.set(loadedKey(packId, source._id), source);
  });
  return sources;
}

function identitySources(matches, sources) {
  const identity = {};
  for (const kind of IDENTITY_KINDS) {
    const match = matches.identity[kind];
    identity[kind] = match ? sources.get(match.key) ?? null : null;
  }
  return identity;
}

function gradualBoosts() {
  return game.settings.get("pf2e", "gradualBoostsVariant") === true;
}

function languageLabels() {
  const labels = {};
  for (const [slug, label] of Object.entries(CONFIG.PF2E.languages ?? {})) labels[slug] = game.i18n.localize(label);
  return labels;
}

function grantedLanguages(ancestry) {
  const granted = ancestry?.system?.languages?.value;
  return Array.isArray(granted) ? granted : [];
}

function unplacedNote(unplaced) {
  return game.i18n.format("ORGANIZR.Build.UnplacedPreparations", { name: unplaced.name, count: unplaced.count });
}

async function removeActor(actor) {
  try {
    await actor.delete();
  } catch (error) {
    console.warn("Organizr connector: the failed build's actor was not removed", error);
  }
}

/** An error whose message is already localized for the user; `buildKey` marks it as a build refusal or failure. */
function buildError(key, data) {
  const error = new Error(game.i18n.format(key, data));
  error.buildKey = key;
  return error;
}
