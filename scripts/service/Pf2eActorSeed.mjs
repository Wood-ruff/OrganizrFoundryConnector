import { ATTRIBUTES, manualAbilities } from "./Pf2eBoosts.mjs";
import { withBuildFlag } from "./Pf2eItemSources.mjs";
import { SKILL_SLUGS } from "./Pf2eRecipe.mjs";
import { IDENTITY_KINDS } from "./Pf2eItemTypes.mjs";
import { clamp } from "../util/WholeNumbers.mjs";

const BUILD_FORMAT_VERSION = 1;
const MAX_LEVEL = 30;
const MAX_SKILL_RANK = 4;
const ACTOR_KEYS = ["name", "img", "_stats", "flags"];
/** The biography facts (`system.details.<fact>.value`) a build writes. */
export const FACT_KEYS = Object.freeze(["age", "height", "weight", "gender", "ethnicity", "nationality"]);
/** The biography texts (`system.details.biography.<text>`) a build writes. */
export const TEXT_KEYS = Object.freeze([
  "birthPlace", "attitude", "beliefs", "likes", "dislikes", "catchphrases", "appearance", "backstory", "campaignNotes",
  "allies", "enemies", "organizations"
]);

/**
 * The character actor to create before any item: the recipe's level (pf2e grants class features by the level at class
 * creation), xp, biography, languages, skill ranks and either the boost selections of `plan.boosts` or, without them,
 * manual modifiers with the key attribute. `plan` = `{boosts: boostPlan | null, languages: [slug], buildId?, gearKeys?}`;
 * the build flag records the build id and the gear keys the build creates when given.
 */
export function actorSeed(document, recipe, plan) {
  const seed = documentFields(document);
  seed.type = "character";
  seed.system = {
    details: detailsOf(recipe, plan?.languages),
    skills: skillRanksOf(recipe?.skills)
  };
  if (plan?.boosts) seed.system.build = { attributes: { boosts: structuredClone(plan.boosts.boosts) } };
  else addManualAttributes(seed.system, recipe);
  return withBuildFlag(seed, buildFlagOf(plan));
}

function buildFlagOf(plan) {
  const flag = { version: BUILD_FORMAT_VERSION };
  if (typeof plan?.buildId === "string") flag.id = plan.buildId;
  if (Array.isArray(plan?.gearKeys)) flag.gearKeys = [...plan.gearKeys];
  return flag;
}

/**
 * The ancestry, heritage, background, class and deity sources in creation order with the plan's boost selections and
 * the key attribute; without boosts only the key attribute is chosen (when the class offers the recipe's one).
 */
export function abcSources(sources, plan, keyAttribute) {
  const boosts = plan?.boosts ?? null;
  const shaped = [];
  for (const kind of IDENTITY_KINDS) {
    const source = sources?.[kind];
    if (!source) continue;
    shaped.push(abcSource(kind, source, boosts, keyAttribute));
  }
  return shaped;
}

/**
 * The recipe's language names as pf2e language slugs: `languages` maps slug → localized label, `granted` holds the slugs
 * the ancestry grants (left out). Unknown names are returned for the report.
 */
export function languageValues(names, languages, granted, sluggify) {
  const result = { value: [], granted: [], unknown: [] };
  const grantedSlugs = new Set(granted ?? []);
  for (const name of names ?? []) {
    const text = typeof name === "string" ? name.trim() : "";
    if (text === "") continue;
    const slug = languageSlug(text, languages ?? {}, sluggify);
    if (slug === null) result.unknown.push(text);
    else if (grantedSlugs.has(slug)) result.granted.push(text);
    else if (!result.value.includes(slug)) result.value.push(slug);
  }
  return result;
}

/** The last actor update of a build: current HP within 0..max, temp HP, hero points and focus points up to their max. */
export function playStateUpdate(recipe, hpMax, focusMax) {
  return {
    "system.attributes.hp.value": clamp(wholeOf(recipe?.hp?.current), 0, wholeOf(hpMax)),
    "system.attributes.hp.temp": Math.max(0, wholeOf(recipe?.hp?.temp)),
    "system.resources.heroPoints.value": Math.max(0, wholeOf(recipe?.heroPoints)),
    "system.resources.focus.value": clamp(wholeOf(recipe?.focusPoints), 0, wholeOf(focusMax))
  };
}

function addManualAttributes(system, recipe) {
  system.abilities = manualAbilities(recipe?.attributes);
  if (ATTRIBUTES.includes(recipe?.keyAttribute)) system.details.keyability = { value: recipe.keyAttribute };
}

function abcSource(kind, source, boosts, keyAttribute) {
  const shaped = structuredClone(source);
  shaped.system = shaped.system ?? {};
  if (kind === "ancestry" && boosts) applyAncestryBoosts(shaped.system, boosts.ancestry);
  if (kind === "background" && boosts) applySlotSelections(shaped.system, boosts.background?.selected);
  if (kind === "class") applyKeyAttribute(shaped.system, boosts ? boosts.keyAttribute : keyAttribute);
  return shaped;
}

function applyAncestryBoosts(system, ancestry) {
  if (Array.isArray(ancestry?.alternate)) {
    system.alternateAncestryBoosts = [...ancestry.alternate];
    return;
  }
  applySlotSelections(system, ancestry?.selected);
}

function applySlotSelections(system, selected) {
  for (const [slot, attribute] of Object.entries(selected ?? {})) {
    if (!system.boosts?.[slot]) continue;
    system.boosts[slot].selected = attribute;
  }
}

function applyKeyAttribute(system, attribute) {
  const offered = system.keyAbility?.value;
  if (!Array.isArray(offered) || !offered.includes(attribute)) return;
  system.keyAbility.selected = attribute;
}

function documentFields(document) {
  const fields = {};
  for (const key of ACTOR_KEYS) {
    if (document?.[key] !== undefined) fields[key] = structuredClone(document[key]);
  }
  if (fields.img === "") delete fields.img;
  return fields;
}

function detailsOf(recipe, languages) {
  const details = {
    level: { value: clamp(wholeOf(recipe?.level), 1, MAX_LEVEL) },
    xp: { value: Math.max(0, wholeOf(recipe?.xp)) },
    languages: { value: [...(languages ?? [])] },
    biography: biographyTexts(recipe?.biography?.texts)
  };
  for (const fact of FACT_KEYS) {
    const value = recipe?.biography?.facts?.[fact];
    if (typeof value === "string" && value !== "") details[fact] = { value };
  }
  return details;
}

function biographyTexts(texts) {
  const biography = {};
  for (const key of TEXT_KEYS) {
    const value = texts?.[key];
    if (typeof value === "string" && value !== "") biography[key] = value;
  }
  return biography;
}

function skillRanksOf(skills) {
  const ranks = {};
  for (const slug of SKILL_SLUGS) ranks[slug] = { rank: clamp(wholeOf(skills?.[slug]), 0, MAX_SKILL_RANK) };
  return ranks;
}

function languageSlug(name, languages, sluggify) {
  const nameSlug = sluggify(name);
  if (Object.hasOwn(languages, nameSlug)) return nameSlug;
  const lowered = name.toLowerCase();
  for (const [slug, label] of Object.entries(languages)) {
    if (typeof label === "string" && label.trim().toLowerCase() === lowered) return slug;
  }
  return null;
}

function wholeOf(value) {
  return Number.isFinite(value) ? Math.trunc(value) : 0;
}
