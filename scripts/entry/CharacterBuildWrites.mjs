import { markCovered, markWriting } from "../service/Pf2eRecipe.mjs";
import { isCovered } from "../service/CompendiumMatch.mjs";
import { featOrder, freeFeatSlots, slotFor, takesFeatSlot } from "../service/FeatSlots.mjs";
import { abcSources } from "../service/Pf2eActorSeed.mjs";
import { buildKeyOf, loreSources, slottedFeat, withBuildOwner } from "../service/Pf2eItemSources.mjs";
import { gearPlan, placedGearSource } from "../service/Pf2eGearSources.mjs";
import { adoptableItems, adoptionUpdates } from "../service/AdoptedItems.mjs";
import { coverUpdates } from "../service/CoverMarks.mjs";
import {
  entrySource, preparedSlots, spellSourcesToCreate, unplacedPreparations
} from "../service/Pf2eSpellSources.mjs";
import { listOf } from "../util/ObjectLists.mjs";

/**
 * Writes a planned build's items onto the actor in pf2e's order: items the entries' linked sheets were pushed from are
 * taken over as roots first, then ancestry, heritage, background, class and deity, the features one at a time into
 * free feat slots, actions, lores, spellcasting and gear with coins; last, items standing in for entries the build did
 * not create get their cover mark. Choice prompts are answered by the caller. Every root names `plan.buildId` as its
 * owner. A rebuild's `plan.keptId(key)` gives a root its previous `_id`, `plan.skipsGear(key)` leaves out gear used up
 * in Foundry and `plan.keepsCoins` the coins. Fills and returns `written` (`{unslotted, attached, unplaced}`) for the
 * report; a caller passing its own sees what was written before a failure.
 */
export async function writeBuildItems(actor, recipe, plan, evidence, written = emptyWritten()) {
  const sluggify = game.pf2e.system.sluggify;
  const adopted = await adoptPushedItems(actor, recipe, plan);
  await createItems(actor, abcSources(plan.identity, { boosts: plan.boosts }, recipe.keyAttribute), plan);
  markItemsCovered(evidence, actor, sluggify);
  await writeFeatures(actor, recipe, plan, { adopted, evidence, sluggify, written });
  await writeActions(actor, recipe, plan, { adopted, evidence, sluggify });
  await writeLores(actor, recipe, plan, sluggify);
  await writeSpellcasting(actor, recipe, plan, { adopted, sluggify, written });
  await writeGear(actor, recipe, plan, { adopted, written });
  await updateItems(actor, coverUpdates(recipe, actor.items, sluggify));
  return written;
}

/** The report lists `writeBuildItems` fills. */
export function emptyWritten() {
  return { unslotted: [], attached: [], unplaced: [] };
}

/** Each uncovered feature in build order, into the free slot of its category; one create each, so grants land first. */
async function writeFeatures(actor, recipe, plan, { adopted, evidence, sluggify, written }) {
  for (const feature of featOrder(listOf(recipe.features))) {
    const source = plan.sources.get(feature.key);
    if (!source || adopted.has(feature.key) || isCovered(feature, actor.items, sluggify)) continue;
    const slot = slotFor(feature, freeFeatSlots([...actor.feats], actor.level));
    if (!slot && takesFeatSlot(feature.category)) written.unslotted.push(feature.name);
    markWriting(evidence, feature.name);
    await createItems(actor, [slottedFeat(source, slot)], plan);
    markWriting(evidence, null);
    markItemsCovered(evidence, actor, sluggify);
  }
}

async function writeActions(actor, recipe, plan, { adopted, evidence, sluggify }) {
  const actions = listOf(recipe.actions)
    .filter((action) => !adopted.has(action.key) && !isCovered(action, actor.items, sluggify));
  await createItems(actor, sourcesOf(actions, plan.sources), plan);
  markItemsCovered(evidence, actor, sluggify);
}

/** Lores the actor lacks are created; ones it holds at a lower rank (background lores) are raised. */
async function writeLores(actor, recipe, plan, sluggify) {
  const { create, updates } = loreSources(recipe.lores, actor.items, sluggify);
  await createItems(actor, create, plan);
  if (updates.length > 0) await actor.updateEmbeddedDocuments("Item", updates);
}

/**
 * The spellcasting entries, then their uncovered spells that were not taken over in one batch, then each prepared
 * entry's slots (taken-over spells included).
 */
async function writeSpellcasting(actor, recipe, plan, { adopted, sluggify, written }) {
  const castings = listOf(recipe.spellcasting);
  const classSlug = plan.identity.class?.system?.slug ?? null;
  const entrySources = castings.map((casting) => entrySource(casting, classSlug, casting.key)).filter(Boolean);
  const entryIds = idsByBuildKey(await createItems(actor, entrySources, plan));
  const toCreate = castings.map((casting) => withoutAdopted(casting, adopted));
  const spells = spellSourcesToCreate(toCreate, plan.sources, actor.items, { entryIds, sluggify });
  const spellIds = new Map([...adopted, ...idsByBuildKey(await createItems(actor, spells, plan))]);
  for (const casting of castings) {
    await prepareEntry(actor.items.get(entryIds.get(casting.key)), casting, spellIds);
    written.unplaced.push(...unplacedPreparations(casting, spellIds));
  }
}

async function prepareEntry(entry, casting, spellIds) {
  const update = preparedSlots(casting, spellIds);
  if (entry && Object.keys(update).length > 0) await entry.update(update);
}

/**
 * Backpacks first (one at a time, outer ones first, so inner ones know their container), then the rest and coins. A
 * taken-over backpack is not created again but still holds the entries placed in it.
 */
async function writeGear(actor, recipe, plan, { adopted, written }) {
  const inventory = listOf(recipe.inventory).filter((entry) => !skipsGear(plan, entry.key));
  const entries = new Map(inventory.map((entry) => [entry.key, entry]));
  const gear = gearPlan(inventory, plan.sources);
  written.attached.push(...gear.attached.map((key) => entries.get(key).name));
  const containerIds = new Map();
  for (const key of gear.containers) {
    if (adopted.has(key)) {
      containerIds.set(key, adopted.get(key));
      continue;
    }
    const source = placedGearSource(plan.sources.get(key), entries.get(key), containerIds.get(gear.parents[key]) ?? null);
    const [created] = await createItems(actor, [source], plan);
    if (created) containerIds.set(key, created.id);
  }
  const items = gear.items.filter((key) => !adopted.has(key)).map((key) => {
    const containerId = containerIds.get(gear.parents[key]) ?? null;
    return placedGearSource(plan.sources.get(key), entries.get(key), containerId);
  });
  await createItems(actor, [...items, ...coinSources(plan)], plan);
}

/** Takes over the items the entries' linked sheets were pushed from as roots of the build; their ids by entry key. */
async function adoptPushedItems(actor, recipe, plan) {
  const adopted = adoptableItems(recipe, plan, actor.items);
  await updateItems(actor, adoptionUpdates(adopted, plan.buildId));
  return new Map(adopted.map(({ key, id }) => [key, id]));
}

function withoutAdopted(casting, adopted) {
  return { ...casting, spells: listOf(casting.spells).filter((spell) => !adopted.has(spell.key)) };
}

async function updateItems(actor, updates) {
  if (updates.length > 0) await actor.updateEmbeddedDocuments("Item", updates, { render: false });
}

function skipsGear(plan, key) {
  return typeof plan.skipsGear === "function" && plan.skipsGear(key);
}

function coinSources(plan) {
  if (plan.keepsCoins === true) return [];
  const coins = plan.matches.entries.filter((match) => match.list === "coins");
  return sourcesOf(coins, plan.sources);
}

/**
 * Creates the sources in one call, each root owned by the plan's build; on a rebuild every root gets its previous `_id`
 * (else a new one) and keeps it.
 */
async function createItems(actor, sources, plan) {
  if (sources.length === 0) return [];
  const owned = sources.map((source) => withBuildOwner(source, plan?.buildId));
  const keptId = plan?.keptId;
  if (typeof keptId !== "function") return actor.createEmbeddedDocuments("Item", owned, { render: false });
  const identified = owned.map((source) => ({ ...source, _id: keptId(buildKeyOf(source)) ?? foundry.utils.randomID() }));
  return actor.createEmbeddedDocuments("Item", identified, { render: false, keepId: true });
}

/** Removes every item name the actor now holds from the evidence's uncovered names (prompts prefer uncovered ones). */
function markItemsCovered(evidence, actor, sluggify) {
  for (const item of actor.items) markCovered(evidence, item.name, sluggify);
}

function sourcesOf(entries, sources) {
  return entries.map((entry) => sources.get(entry.key)).filter(Boolean);
}

function idsByBuildKey(items) {
  const ids = new Map();
  for (const item of items ?? []) {
    const key = buildKeyOf(item);
    if (key !== null) ids.set(key, item.id);
  }
  return ids;
}
