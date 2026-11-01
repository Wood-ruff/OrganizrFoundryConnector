/** The six pf2e attributes in the order the boost search tries them. */
export const ATTRIBUTES = ["str", "dex", "con", "int", "wis", "cha"];

const LATER_LEVELS = [5, 10, 15, 20];
const BOOSTS_PER_LEVEL = 4;
const LEVEL_ONE_BOOSTS = 4;
const ALTERNATE_BOOSTS = 2;
const PARTIAL_FROM = 4;

/**
 * The boost selections that make pf2e derive the target modifiers from the ancestry, background and class boost slots,
 * or null (gradual-boost variant, or no selection reaches the targets). Prefers a plan that spends every later boost.
 */
export function boostPlan(input) {
  if (!input || input.gradual) return null;
  const standard = bestPlanOf(input, standardAncestryPicks(input.ancestry));
  if (standard !== null && standard.unspent === 0) return standard;
  if (!input.ancestry) return standard;
  const alternate = bestPlanOf(input, alternateAncestryPicks());
  return fewerUnspent(standard, alternate);
}

/** Why the attributes are written as plain modifiers instead of boosts: "gradual", "unreachable" or null (boosts used). */
export function manualReason(input, plan) {
  if (input?.gradual) return "gradual";
  if (plan === null) return "unreachable";
  return null;
}

/** `system.abilities` for pf2e's manual attribute mode: every attribute with its whole target modifier. */
export function manualAbilities(targets) {
  const abilities = {};
  for (const attribute of ATTRIBUTES) abilities[attribute] = { mod: targetOf(targets, attribute) };
  return abilities;
}

/** The solver input read from the recipe and the loaded ancestry, background and class sources. */
export function boostInput({ recipe, ancestry, background, cls, gradual }) {
  return {
    targets: recipe?.attributes ?? {},
    level: recipe?.level,
    keyAttribute: recipe?.keyAttribute ?? "",
    ancestry: ancestry ? ancestryInput(ancestry) : null,
    background: background ? { slots: slotOptions(background.system?.boosts) } : null,
    classKeys: optionList(cls?.system?.keyAbility?.value),
    gradual: Boolean(gradual)
  };
}

/** The later-boost counts (0..levels) that take an attribute from its level-1 value to the target, ascending. */
export function laterBoostCounts(base, target, levels) {
  const counts = [];
  for (let count = 0; count <= levels; count++) {
    if (boostedValue(base, count) === target) counts.push(count);
  }
  return counts;
}

function boostedValue(base, count) {
  let value = base;
  for (let step = 0; step < count; step++) value += value >= PARTIAL_FROM ? 0.5 : 1;
  return Math.trunc(value);
}

function bestPlanOf(input, ancestryPicks) {
  let best = null;
  for (const ancestry of ancestryPicks) {
    for (const background of slotPicks(input.background?.slots)) {
      for (const classKey of classKeyPicks(input)) {
        for (const levelOne of combinations(ATTRIBUTES, LEVEL_ONE_BOOSTS)) {
          const plan = planFor(input, { ancestry, background, classKey, levelOne });
          best = fewerUnspent(best, plan);
          if (best !== null && best.unspent === 0) return best;
        }
      }
    }
  }
  return best;
}

function planFor(input, pick) {
  const levels = laterLevelsReached(input.level);
  const counts = laterCounts(levelOneValues(input, pick), input.targets, levels.length);
  if (counts === null) return null;
  const later = spreadOverLevels(counts, levels);
  if (later === null) return null;
  return {
    ancestry: pick.ancestry.result,
    background: { selected: pick.background.selected },
    keyAttribute: pick.classKey,
    boosts: { "1": [...pick.levelOne], ...later },
    unspent: BOOSTS_PER_LEVEL * levels.length - sumOf(Object.values(counts))
  };
}

function levelOneValues(input, pick) {
  const values = {};
  for (const attribute of ATTRIBUTES) {
    let value = 0;
    if (pick.ancestry.boosts.includes(attribute)) value += 1;
    if (pick.ancestry.flaws.includes(attribute)) value -= 1;
    if (pick.background.attributes.includes(attribute)) value += 1;
    if (pick.classKey === attribute) value += 1;
    if (pick.levelOne.includes(attribute)) value += 1;
    values[attribute] = value;
  }
  return values;
}

/** One later-boost count per attribute, as many as fit into the reached levels; null when the targets need more. */
function laterCounts(baseValues, targets, levelCount) {
  const ranges = {};
  for (const attribute of ATTRIBUTES) {
    const counts = laterBoostCounts(baseValues[attribute], targetOf(targets, attribute), levelCount);
    if (counts.length === 0) return null;
    ranges[attribute] = { low: counts[0], high: counts[counts.length - 1] };
  }
  return countsWithin(ranges, BOOSTS_PER_LEVEL * levelCount);
}

function countsWithin(ranges, available) {
  const counts = {};
  for (const attribute of ATTRIBUTES) counts[attribute] = ranges[attribute].high;
  let excess = sumOf(Object.values(counts)) - available;
  for (const attribute of ATTRIBUTES) {
    if (excess <= 0) break;
    const lowered = Math.min(excess, counts[attribute] - ranges[attribute].low);
    counts[attribute] -= lowered;
    excess -= lowered;
  }
  return excess > 0 ? null : counts;
}

/** Each reached later level takes up to 4 distinct attributes, those with the most boosts still to give first. */
function spreadOverLevels(counts, levels) {
  const remaining = { ...counts };
  const boosts = {};
  for (const level of levels) {
    const chosen = attributesWithMostRemaining(remaining).slice(0, BOOSTS_PER_LEVEL);
    for (const attribute of chosen) remaining[attribute] -= 1;
    boosts[String(level)] = ATTRIBUTES.filter((attribute) => chosen.includes(attribute));
  }
  if (sumOf(Object.values(remaining)) > 0) return null;
  return boosts;
}

function attributesWithMostRemaining(remaining) {
  const open = ATTRIBUTES.filter((attribute) => remaining[attribute] > 0);
  return open.sort((first, second) => remaining[second] - remaining[first]);
}

function standardAncestryPicks(ancestry) {
  if (!ancestry) return [{ result: { selected: {} }, boosts: [], flaws: [] }];
  const flaws = optionList(ancestry.flaws);
  return slotPicks(ancestry.slots).map((pick) => ({ result: { selected: pick.selected }, boosts: pick.attributes, flaws }));
}

function alternateAncestryPicks() {
  return combinations(ATTRIBUTES, ALTERNATE_BOOSTS).map((pair) => ({ result: { alternate: pair }, boosts: pair, flaws: [] }));
}

function classKeyPicks(input) {
  const offered = ATTRIBUTES.filter((attribute) => optionList(input.classKeys).includes(attribute));
  if (offered.includes(input.keyAttribute)) return [input.keyAttribute];
  if (offered.length === 0) return [null];
  return offered;
}

/** Every distinct set of attributes the boost slots can give (one distinct option per slot), with its slot selections. */
function slotPicks(slots) {
  const picks = [];
  const seen = new Set();
  for (const pick of slotAssignments(optionList(slots), 0, {}, [])) {
    const id = [...pick.attributes].sort().join(",");
    if (seen.has(id)) continue;
    seen.add(id);
    picks.push(pick);
  }
  return picks;
}

function slotAssignments(slots, index, selected, attributes) {
  if (index === slots.length) return [{ selected: { ...selected }, attributes: [...attributes] }];
  const options = ATTRIBUTES.filter((attribute) => optionList(slots[index]).includes(attribute));
  if (options.length === 0) return slotAssignments(slots, index + 1, selected, attributes);
  const assignments = [];
  for (const option of options) {
    if (attributes.includes(option)) continue;
    const nextSelected = { ...selected, [String(index)]: option };
    assignments.push(...slotAssignments(slots, index + 1, nextSelected, [...attributes, option]));
  }
  return assignments;
}

function combinations(values, size) {
  if (size === 0) return [[]];
  const result = [];
  for (let index = 0; index <= values.length - size; index++) {
    for (const rest of combinations(values.slice(index + 1), size - 1)) result.push([values[index], ...rest]);
  }
  return result;
}

function laterLevelsReached(level) {
  return LATER_LEVELS.filter((later) => later <= level);
}

function fewerUnspent(current, candidate) {
  if (candidate === null) return current;
  if (current === null || candidate.unspent < current.unspent) return candidate;
  return current;
}

function ancestryInput(ancestry) {
  return { slots: slotOptions(ancestry.system?.boosts), flaws: fixedFlaws(ancestry.system?.flaws), alternate: true };
}

function slotOptions(boosts) {
  if (!boosts || typeof boosts !== "object") return [];
  const keys = Object.keys(boosts).sort((first, second) => Number(first) - Number(second));
  return keys.map((key) => optionList(boosts[key]?.value));
}

function fixedFlaws(flaws) {
  if (!flaws || typeof flaws !== "object") return [];
  const fixed = [];
  for (const flaw of Object.values(flaws)) {
    const options = optionList(flaw?.value);
    if (options.length === 1) fixed.push(options[0]);
  }
  return fixed;
}

function targetOf(targets, attribute) {
  const value = targets?.[attribute];
  return Number.isFinite(value) ? Math.trunc(value) : 0;
}

function optionList(value) {
  return Array.isArray(value) ? value : [];
}

function sumOf(values) {
  let sum = 0;
  for (const value of values) sum += value;
  return sum;
}
