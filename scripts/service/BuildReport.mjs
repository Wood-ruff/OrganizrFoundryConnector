import { unansweredChoices } from "./ChoiceAnswers.mjs";

const LIST_FINDINGS = [
  "missing", "ambiguous", "custom", "unslotted", "attached", "defaulted", "unanswered", "differences", "notes"
];
const CARD_KEY = "ORGANIZR.Build.Card.";

/** A build report of one character with nothing found yet; `updated` is true for a rebuilt actor. */
export function emptyReport(name, updated) {
  return {
    name,
    updated: updated === true,
    missing: [],
    ambiguous: [],
    custom: [],
    unslotted: [],
    attached: [],
    defaulted: [],
    unanswered: [],
    manualAttributes: null,
    unspentBoosts: 0,
    differences: [],
    notes: []
  };
}

/**
 * The report of a finished build from its parts: the matching findings (`{missing, ambiguous, custom}`), unknown
 * languages (missing), unslotted and attached names, the prompts' defaulted choices, unanswered choices of the prompts
 * and the created item sources, the attribute mode, unspent boosts, totals differences and notes.
 */
export function filledReport(name, updated, parts) {
  const report = emptyReport(name, updated);
  const languages = listOf(parts?.unknownLanguages).map((language) => ({ list: "languages", name: language }));
  report.missing = [...listOf(parts?.findings?.missing), ...languages];
  report.ambiguous = [...listOf(parts?.findings?.ambiguous)];
  report.custom = [...listOf(parts?.findings?.custom)];
  report.unslotted = [...listOf(parts?.unslotted)];
  report.attached = [...listOf(parts?.attached)];
  report.defaulted = defaultedChoices(parts?.prompts);
  report.unanswered = unansweredChoices(parts?.prompts, parts?.itemSources);
  report.manualAttributes = parts?.manualAttributes ?? null;
  report.unspentBoosts = parts?.unspentBoosts > 0 ? parts.unspentBoosts : 0;
  report.differences = [...listOf(parts?.differences)];
  report.notes = [...listOf(parts?.notes)];
  return report;
}

/** Whether the report has anything to show: a non-empty list, manual attributes or unspent boosts. */
export function hasFindings(report) {
  if (!report) return false;
  if (LIST_FINDINGS.some((list) => lengthOf(report[list]) > 0)) return true;
  return Boolean(report.manualAttributes) || report.unspentBoosts > 0;
}

/**
 * The toast after a build: built or rebuilt without findings, else the findings with their counts (`missing` covers
 * ambiguous entries, `choices` defaulted and unanswered ones, `findings` everything).
 */
export function reportToast(report) {
  const name = report?.name ?? "";
  if (!hasFindings(report)) {
    return { key: report?.updated ? "ORGANIZR.Build.Rebuilt" : "ORGANIZR.Build.Built", data: { name } };
  }
  return { key: "ORGANIZR.Build.Findings", data: { name, ...findingCounts(report) } };
}

/**
 * The report card's view: the non-empty groups in card order, each `{id, titleKey, titleData, rows: [{label, text}]}`.
 * `labels.lists` names the recipe lists, `labels.difference(key)` a totals key; both fall back to the raw value.
 */
export function reportView(report, labels = {}) {
  const groups = [
    rowGroup("missing", report.missing, (entry) => listRow(entry, labels)),
    rowGroup("ambiguous", report.ambiguous, (entry) => ({ ...listRow(entry, labels), count: entry.count })),
    rowGroup("custom", report.custom, (entry) => listRow(entry, labels)),
    rowGroup("unslotted", report.unslotted, (name) => ({ label: "", text: name })),
    rowGroup("attached", report.attached, (name) => ({ label: "", text: name })),
    rowGroup("defaulted", report.defaulted, (entry) => ({ label: entry.item, text: entry.choice })),
    rowGroup("unanswered", report.unanswered, (entry) => ({ label: entry.item, text: "" })),
    manualGroup(report.manualAttributes),
    unspentGroup(report.unspentBoosts),
    rowGroup("differences", report.differences, (difference) => differenceRow(difference, labels)),
    rowGroup("notes", report.notes, (note) => ({ label: "", text: note }))
  ];
  return { name: report.name, updated: report.updated, groups: groups.filter(Boolean) };
}

function findingCounts(report) {
  const counts = {
    missing: lengthOf(report.missing) + lengthOf(report.ambiguous),
    custom: lengthOf(report.custom),
    choices: lengthOf(report.defaulted) + lengthOf(report.unanswered),
    differences: lengthOf(report.differences)
  };
  let findings = 0;
  for (const list of LIST_FINDINGS) findings += lengthOf(report[list]);
  if (report.manualAttributes) findings += 1;
  if (report.unspentBoosts > 0) findings += 1;
  return { ...counts, findings };
}

function rowGroup(id, entries, toRow) {
  if (lengthOf(entries) === 0) return null;
  return { id, titleKey: titleKey(id), titleData: { count: entries.length }, rows: entries.map(toRow) };
}

function manualGroup(reason) {
  if (!reason) return null;
  return { id: "manual", titleKey: titleKey("manual"), titleData: { reason }, rows: [] };
}

function unspentGroup(unspent) {
  if (!(unspent > 0)) return null;
  return { id: "unspentBoosts", titleKey: titleKey("unspentBoosts"), titleData: { count: unspent }, rows: [] };
}

function listRow(entry, labels) {
  return { label: labels.lists?.[entry.list] ?? entry.list, text: entry.name };
}

function differenceRow(difference, labels) {
  const label = labels.difference?.(difference.key) ?? difference.key;
  return { label, text: `${difference.foundry} / ${difference.organizr}` };
}

/** "unspentBoosts" → "ORGANIZR.Build.Card.UnspentBoosts". */
function titleKey(id) {
  return CARD_KEY + id.charAt(0).toUpperCase() + id.slice(1);
}

function lengthOf(list) {
  return Array.isArray(list) ? list.length : 0;
}

/** The prompts answered with the first choice for lack of evidence, as `{item, choice}`. */
function defaultedChoices(prompts) {
  return listOf(prompts).filter((prompt) => prompt?.how === "default").map((prompt) => ({
    item: prompt.item,
    choice: prompt.choice
  }));
}

function listOf(value) {
  return Array.isArray(value) ? value : [];
}
