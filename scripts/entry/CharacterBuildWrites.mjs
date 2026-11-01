import { markCovered } from "../service/Pf2eRecipe.mjs";
import { isCovered } from "../service/CompendiumMatch.mjs";
import { featOrder, freeFeatSlots, slotFor } from "../service/FeatSlots.mjs";
import { abcSources } from "../service/Pf2eActorSeed.mjs";
import { buildKeyOf, loreSources, slottedFeat } from "../service/Pf2eItemSources.mjs";
import { gearPlan, placedGearSource } from "../service/Pf2eGearSources.mjs";
import {
  entrySource, preparedSlots, spellLocation, unplacedPreparations
} from "../service/Pf2eSpellSources.mjs";

/**
 * Writes a planned build's items onto the actor in pf2e's order: ancestry, heritage, background, class and deity, the
 * features one at a time into free feat slots, actions, lores, spellcasting and gear with coins. Choice prompts are
 * answered by the caller. Returns `{unslotted, attached, unplaced}` for the report.
 */
export async function writeBuildItems(actor, recipe, plan, evidence) {
  const sluggify = game.pf2e.system.sluggify;
  const written = { unslotted: [], attached: [], unplaced: [] };
  await createItems(actor, abcSources(plan.identity, { boosts: plan.boosts }, recipe.keyAttribute));
  markItemsCovered(evidence, actor, sluggify);
  await writeFeatures(actor, recipe, plan, { evidence, sluggify, written });
  await writeActions(actor, recipe, plan, { evidence, sluggify });
  await writeLores(actor, recipe, sluggify);
  await writeSpellcasting(actor, recipe, plan, { sluggify, written });
  await writeGear(actor, recipe, plan, written);
  return written;
}

/** Each uncovered feature in build order, into the free slot of its category; one create each, so grants land first. */
async function writeFeatures(actor, recipe, plan, { evidence, sluggify, written }) {
  for (const feature of featOrder(listOf(recipe.features))) {
    const source = plan.sources.get(feature.key);
    if (!source || isCovered(feature, actor.items, sluggify)) continue;
    const slot = slotFor(feature, freeFeatSlots([...actor.feats], actor.level));
    if (!slot) written.unslotted.push(feature.name);
    await createItems(actor, [slottedFeat(source, slot)]);
    markItemsCovered(evidence, actor, sluggify);
  }
}

async function writeActions(actor, recipe, plan, { evidence, sluggify }) {
  const actions = listOf(recipe.actions).filter((action) => !isCovered(action, actor.items, sluggify));
  await createItems(actor, sourcesOf(actions, plan.sources));
  markItemsCovered(evidence, actor, sluggify);
}

/** Lores the actor lacks are created; ones it holds at a lower rank (background lores) are raised. */
async function writeLores(actor, recipe, sluggify) {
  const { create, updates } = loreSources(recipe.lores, actor.items, sluggify);
  await createItems(actor, create);
  if (updates.length > 0) await actor.updateEmbeddedDocuments("Item", updates);
}

/** The spellcasting entries, then their uncovered spells in one batch, then each prepared entry's slots. */
async function writeSpellcasting(actor, recipe, plan, { sluggify, written }) {
  const castings = listOf(recipe.spellcasting);
  const classSlug = plan.identity.class?.system?.slug ?? null;
  const entrySources = castings.map((casting) => entrySource(casting, classSlug, casting.key)).filter(Boolean);
  const entryIds = idsByBuildKey(await createItems(actor, entrySources));
  const spells = spellSources(actor, castings, plan.sources, { entryIds, sluggify });
  const spellIds = idsByBuildKey(await createItems(actor, spells));
  for (const casting of castings) {
    await prepareEntry(actor.items.get(entryIds.get(casting.key)), casting, spellIds);
    written.unplaced.push(...unplacedPreparations(casting, spellIds));
  }
}

/** The spell sources to create, located in their entry; a spell the actor or the batch already holds is skipped. */
function spellSources(actor, castings, sources, { entryIds, sluggify }) {
  const queued = [];
  for (const casting of castings) {
    for (const spell of listOf(casting.spells)) {
      const source = sources.get(spell.key);
      if (!source || isCovered(spell, [...actor.items, ...queued], sluggify)) continue;
      const location = spellLocation(spell, casting, entryIds.get(casting.key) ?? null);
      queued.push({ ...source, system: { ...(source.system ?? {}), location } });
    }
  }
  return queued;
}

async function prepareEntry(entry, casting, spellIds) {
  const update = preparedSlots(casting, spellIds);
  if (entry && Object.keys(update).length > 0) await entry.update(update);
}

/** Backpacks first (one at a time, outer ones first, so inner ones know their container), then the rest and coins. */
async function writeGear(actor, recipe, plan, written) {
  const inventory = listOf(recipe.inventory);
  const entries = new Map(inventory.map((entry) => [entry.key, entry]));
  const gear = gearPlan(inventory, plan.sources);
  written.attached.push(...gear.attached.map((key) => entries.get(key).name));
  const containerIds = new Map();
  for (const key of gear.containers) {
    const source = placedGearSource(plan.sources.get(key), entries.get(key), containerIds.get(gear.parents[key]) ?? null);
    const [created] = await createItems(actor, [source]);
    if (created) containerIds.set(key, created.id);
  }
  const items = gear.items.map((key) => {
    const containerId = containerIds.get(gear.parents[key]) ?? null;
    return placedGearSource(plan.sources.get(key), entries.get(key), containerId);
  });
  await createItems(actor, [...items, ...coinSources(plan)]);
}

function coinSources(plan) {
  const coins = plan.matches.entries.filter((match) => match.list === "coins");
  return sourcesOf(coins, plan.sources);
}

async function createItems(actor, sources) {
  if (sources.length === 0) return [];
  return actor.createEmbeddedDocuments("Item", sources, { render: false });
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

function listOf(value) {
  return Array.isArray(value) ? value.filter((entry) => entry !== null && typeof entry === "object") : [];
}
