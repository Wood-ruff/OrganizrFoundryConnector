import { recipeEvidence } from "../service/Pf2eRecipe.mjs";
import { matchFindings } from "../service/Pf2eBuildMatches.mjs";
import { filledReport } from "../service/BuildReport.mjs";
import { totalsDifferences } from "../service/TotalsCompare.mjs";
import { pf2eDerivedTotals } from "../service/Pf2eTotals.mjs";
import { totalsActor } from "../service/Pf2eTotalsActor.mjs";
import { withChoicePrompts } from "./ChoicePrompts.mjs";
import { writeBuildItems } from "./CharacterBuildWrites.mjs";

/** Writes the build's items while every choice prompt is answered from the recipe and the previous selections. */
export async function writeWithPrompts(actor, recipe, plan, { outcome, written, previous }) {
  const sluggify = game.pf2e.system.sluggify;
  const evidence = recipeEvidence(recipe, sluggify, previous);
  await withChoicePrompts(actor, { evidence, outcome }, () => writeBuildItems(actor, recipe, plan, evidence, written));
}

/** The report of a build or rebuild (`updated`) from the plan, the answered prompts and what was written. */
export function buildReport(actor, recipe, plan, prompts, written, updated) {
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

function unplacedNote(unplaced) {
  return game.i18n.format("ORGANIZR.Build.UnplacedPreparations", { name: unplaced.name, count: unplaced.count });
}
