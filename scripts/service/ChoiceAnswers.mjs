import { baseName, SKILL_SLUGS } from "./Pf2eRecipe.mjs";

/**
 * The choice to pick in a pf2e choice prompt (`{itemName, sourceId, choices: [{value, label}]}`) from recipe evidence:
 * a previous selection, the item's suffix, an uncovered recipe name (lowest level first), any recipe name, the best
 * ranked skill, else the first choice. → `{index, how}`, or null without choices.
 */
export function answerChoice(prompt, evidence, sluggify) {
  const choices = Array.isArray(prompt?.choices) ? prompt.choices : [];
  if (choices.length === 0) return null;
  const slugs = choices.map((choice) => labelSlug(choice, sluggify));
  const answers = [
    ["previous", () => previousIndex(choices, evidence?.previous?.get(prompt.sourceId))],
    ["suffix", () => suffixIndex(slugs, evidence?.suffixes, prompt.itemName, sluggify)],
    ["uncovered", () => uncoveredIndex(slugs, evidence?.uncovered, evidence?.levels)],
    ["name", () => slugs.findIndex((slug) => evidence?.names?.has(slug) === true)],
    ["skill", () => skillIndex(choices, evidence?.skillRanks)]
  ];
  for (const [how, indexOf] of answers) {
    const index = indexOf();
    if (index >= 0) return { index, how };
  }
  return { index: 0, how: "default" };
}

/**
 * The items left without a choice: prompts recorded with `choice: null`, then items whose ChoiceSet rule pf2e marked
 * `ignored` (a rule whose predicate failed has no selection and is not listed). One `{item}` per item name.
 */
export function unansweredChoices(prompts, itemSources) {
  const names = [];
  for (const prompt of prompts ?? []) {
    if (prompt?.choice === null) names.push(prompt.item);
  }
  for (const source of itemSources ?? []) {
    if (hasIgnoredChoice(source)) names.push(source.name);
  }
  return [...new Set(names)].map((item) => ({ item }));
}

function labelSlug(choice, sluggify) {
  const label = typeof choice?.label === "string" ? choice.label.trim() : "";
  return label === "" ? "" : sluggify(label);
}

function previousIndex(choices, previousValues) {
  if (!previousValues || previousValues.size === 0) return -1;
  const previous = [...previousValues];
  return choices.findIndex((choice) => previous.some((value) => sameValue(value, choice?.value)));
}

function sameValue(left, right) {
  if (left === right) return true;
  return JSON.stringify(left) === JSON.stringify(right);
}

function suffixIndex(slugs, suffixes, itemName, sluggify) {
  const base = baseName(itemName).base;
  if (base === "") return -1;
  const wanted = suffixes?.get(sluggify(base));
  if (!wanted) return -1;
  return slugs.findIndex((slug) => wanted.has(slug));
}

/** The uncovered choice with the lowest recipe level (no level counts last), ties in choice order. */
function uncoveredIndex(slugs, uncovered, levels) {
  let best = -1;
  let bestLevel = Infinity;
  slugs.forEach((slug, index) => {
    if (slug === "" || uncovered?.has(slug) !== true) return;
    const level = levels?.get(slug) ?? Infinity;
    if (best < 0 || level < bestLevel) {
      best = index;
      bestLevel = level;
    }
  });
  return best;
}

/** When every choice is a skill: the one with the highest recipe rank, ties in choice order. */
function skillIndex(choices, skillRanks) {
  if (!choices.every((choice) => SKILL_SLUGS.includes(choice?.value))) return -1;
  let best = 0;
  choices.forEach((choice, index) => {
    if (rankOf(skillRanks, choice.value) > rankOf(skillRanks, choices[best].value)) best = index;
  });
  return best;
}

function rankOf(skillRanks, skill) {
  return skillRanks?.get(skill) ?? 0;
}

function hasIgnoredChoice(source) {
  const rules = source?.system?.rules;
  if (!Array.isArray(rules)) return false;
  return rules.some((rule) => rule?.key === "ChoiceSet" && rule.ignored === true);
}
