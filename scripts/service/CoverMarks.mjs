import { MODULE_ID } from "../config/ModuleId.mjs";
import { coveringItem } from "./CompendiumMatch.mjs";
import { buildKeyOf, coversOf } from "./Pf2eItemSources.mjs";
import { listOf } from "../util/ObjectLists.mjs";

/**
 * The updates that mark each actor item standing in for a feature, action or spell entry the build did not create
 * (one pf2e granted, or a Foundry item holding it under the `isCovered` rules) with the entry's key as
 * `build.covers`, so a push leaves that entry's sheet alone. Items with a build key are never marked and no item
 * becomes a root; a feature prefers a feat and an action an action item of its name; a spell counts only in its own
 * entry; an item stands in for one entry; a mark already in place gives no update.
 */
export function coverUpdates(recipe, actorItems, sluggify) {
  const items = [...(actorItems ?? [])];
  const builtKeys = new Set(items.map(buildKeyOf).filter((key) => key !== null));
  const unbuilt = items.filter((item) => buildKeyOf(item) === null);
  const marks = { builtKeys, claimed: new Set(), updates: [], sluggify };
  for (const entry of listOf(recipe?.features)) markCovering(marks, entry, unbuilt, "feat");
  for (const entry of listOf(recipe?.actions)) markCovering(marks, entry, unbuilt, "action");
  for (const casting of listOf(recipe?.spellcasting)) {
    const entryId = idOf(items.find((item) => buildKeyOf(item) === casting.key)) ?? null;
    const held = unbuilt.filter((item) => locationOf(item) === entryId);
    for (const spell of listOf(casting.spells)) markCovering(marks, spell, held, "spell");
  }
  return marks.updates;
}

function markCovering(marks, entry, candidates, preferredType) {
  if (typeof entry?.key !== "string" || marks.builtKeys.has(entry.key)) return;
  const free = candidates.filter((item) => !marks.claimed.has(idOf(item)));
  const preferred = free.filter((item) => item?.type === preferredType);
  const item = coveringItem(entry, preferred, marks.sluggify) ?? coveringItem(entry, free, marks.sluggify);
  if (!item) return;
  marks.claimed.add(idOf(item));
  if (coversOf(item) !== entry.key) {
    marks.updates.push({ _id: idOf(item), [`flags.${MODULE_ID}.build.covers`]: entry.key });
  }
}

function locationOf(item) {
  return item?.system?.location?.value ?? null;
}

function idOf(item) {
  return item?.id ?? item?._id ?? null;
}
