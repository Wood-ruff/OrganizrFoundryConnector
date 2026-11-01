import { IDENTITY_KINDS } from "../service/Pf2eItemTypes.mjs";
import {
  classMatched, loadedKey, matchSources, neededPacks, packIdsOf, recipeMatches
} from "../service/Pf2eBuildMatches.mjs";
import { boostInput, boostPlan, manualReason } from "../service/Pf2eBoosts.mjs";
import { languageValues } from "../service/Pf2eActorSeed.mjs";
import { gearKeysOf } from "../service/Pf2eGearSources.mjs";
import { indexRows, packSources } from "../persistence/CompendiumIndex.mjs";
import { buildError } from "./BuildErrors.mjs";

/** The share of a build's progress notice that planning takes. */
export const PLANNED_SHARE = 0.4;

/**
 * Everything decided before a write: the compendium matches (the class must match once), the loaded and shaped item
 * sources by build key, the identity sources, the boost plan (null = manual attributes), the language slugs, the gear
 * keys the build creates and the build id its roots are owned by.
 */
export async function planBuild(recipe, buildId) {
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
  const gearKeys = gearKeysOf(recipe.inventory, sources);
  return { matches, sources, identity, boosts, manual: manualReason(input, boosts), languages, gearKeys, buildId };
}

/** The seed plan of the actor: boosts, language slugs, build id and gear keys. */
export function seedPlanOf(plan) {
  return { boosts: plan.boosts, languages: plan.languages.value, buildId: plan.buildId, gearKeys: plan.gearKeys };
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
