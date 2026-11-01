import { recipeErrorKey, recipeEvidence } from "../service/Pf2eRecipe.mjs";
import { appliesPortrait, withRequestedFileId } from "../service/SheetImport.mjs";
import {
  classMatched, loadedKey, matchFindings, matchSources, neededPacks, packIdsOf, recipeMatches
} from "../service/Pf2eBuildMatches.mjs";
import { boostInput, boostPlan, manualReason } from "../service/Pf2eBoosts.mjs";
import { actorSeed, languageValues, playStateUpdate } from "../service/Pf2eActorSeed.mjs";
import { filledReport } from "../service/BuildReport.mjs";
import { totalsDifferences } from "../service/TotalsCompare.mjs";
import { pf2eDerivedTotals } from "../service/Pf2eTotals.mjs";
import { readWorldLink } from "../config/ModuleSettings.mjs";
import { worldInfo } from "../config/WorldInfo.mjs";
import { createOrganizrClient } from "../client/OrganizrClient.mjs";
import { indexRows, packSources } from "../persistence/CompendiumIndex.mjs";
import { withChoicePrompts } from "./ChoicePrompts.mjs";
import { linkedCopy, recordLink, stampDocumentUuid, withStoredPortrait } from "./ImportSteps.mjs";
import { writeBuildItems } from "./CharacterBuildWrites.mjs";
import { startBuildNotice } from "./BuildReport.mjs";

const IDENTITY_KINDS = ["ancestry", "heritage", "background", "class", "deity"];
const NO_COMPANIONS = Object.freeze({ count: 0, failed: 0, folderName: null });
const PLANNED_SHARE = 0.4;

const organizr = createOrganizrClient();

/**
 * Builds a pf2e character from its Organizr recipe: pf2e's own compendium items plus the linked sheets' exports for
 * what the compendium lacks, every choice prompt answered from the recipe. Plans first (nothing is written when the
 * class has no single match), then creates the actor and its items; a failure after that removes the actor.
 * Returns importSheet's shape plus `build` (the build report); warnings are localization keys.
 */
export async function importCharacterBuild(fileId, { recordedUuid = null, restoreInventory = false } = {}) {
  const link = readWorldLink();
  const world = worldInfo();
  const warnings = [];
  const { document: data, recipe } = await fetchRecipe(link, fileId, world.systemId);
  const document = appliesPortrait("Actor", data) ? await withStoredPortrait(data, link, warnings) : data;
  const { target, duplicates } = linkedCopy(fileId, "Actor", recordedUuid);
  if (target) await refreshBuiltActor(target, { restoreInventory });
  const notice = startBuildNotice(recipe.name);
  let built;
  try {
    const plan = await planBuild(recipe);
    notice.advance(PLANNED_SHARE);
    built = await createBuiltActor(document, recipe, plan);
  } finally {
    notice.close();
  }
  await stampDocumentUuid(built.actor);
  await recordLink(link, fileId, built.actor, world, warnings);
  const { actor, report } = built;
  const companions = NO_COMPANIONS;
  return { name: actor.name, uuid: actor.uuid, updated: false, warnings, duplicates, companions, build: report };
}

/** The recipe answer with the sheet flag naming the requested file; an unreadable recipe is refused before any work. */
async function fetchRecipe(link, fileId, systemId) {
  const payload = await organizr.fetchCharacterRecipe(link, fileId, systemId);
  const errorKey = recipeErrorKey(payload);
  if (errorKey) throw buildError(errorKey, { name: payload?.document?.name ?? `#${fileId}` });
  return { document: withRequestedFileId(payload.document, fileId), recipe: payload.recipe };
}

/** Rebuilding a linked actor in place (with or without restoring its inventory) is not available yet; nothing changes. */
async function refreshBuiltActor(target, options) {
  const message = game.i18n.localize("ORGANIZR.Build.RefreshUnavailable");
  throw buildError("ORGANIZR.Build.Errors.RefreshFailed", { name: target.name, message, ...options });
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
  const sluggify = game.pf2e.system.sluggify;
  const evidence = recipeEvidence(recipe, sluggify);
  const outcome = { prompts: [] };
  const written = await withChoicePrompts(evidence, outcome, () => writeBuildItems(actor, recipe, plan, evidence));
  await actor.update(playStateUpdate(recipe, actor.hitPoints?.max, actor.system?.resources?.focus?.max));
  return buildReport(actor, recipe, plan, outcome.prompts, written);
}

function buildReport(actor, recipe, plan, prompts, written) {
  return filledReport(actor.name, false, {
    findings: matchFindings(plan.matches),
    unknownLanguages: plan.languages.unknown,
    unslotted: written.unslotted,
    attached: written.attached,
    prompts,
    itemSources: actor.items.map((item) => item.toObject()),
    manualAttributes: plan.manual,
    unspentBoosts: plan.boosts?.unspent ?? 0,
    differences: totalsDifferences(recipe.expected, pf2eDerivedTotals(actor)),
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
