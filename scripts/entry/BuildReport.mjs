import { hasFindings, reportToast, reportView } from "../service/BuildReport.mjs";
import { differenceLabel } from "../service/BuildCardLabels.mjs";

const TEMPLATE = "modules/organizr-foundry-connector/templates/build-report.hbs";
const REPORT_LISTS = ["identity", "features", "actions", "spells", "inventory", "lores", "languages", "coins"];
const SPEAKER = "Organizr";

/** A progress notice shown while a character is built (it can take a minute); `advance(share)` moves its bar. */
export function startBuildNotice(name) {
  const format = { name: name ?? "" };
  const notice = ui.notifications.info("ORGANIZR.Build.Running", { localize: true, format, progress: true });
  return {
    advance: (share) => notice?.update?.({ pct: share }),
    close: () => ui.notifications.remove(notice)
  };
}

/** The toast after a build: built or rebuilt, or the findings with their counts (a warning). */
export function notifyBuild(report) {
  const { key, data } = reportToast(report);
  const options = { localize: true, format: data };
  if (hasFindings(report)) ui.notifications.warn(key, options);
  else ui.notifications.info(key, options);
}

/** Whispers the build report card to the current user when the build has findings. */
export async function postBuildReport(report) {
  if (!hasFindings(report)) return;
  const content = await foundry.applications.handlebars.renderTemplate(TEMPLATE, cardContext(report));
  await ChatMessage.create({ content, whisper: [game.user.id], speaker: { alias: SPEAKER } });
}

function cardContext(report) {
  const view = reportView(report, { lists: listLabels(), difference: differenceText });
  return {
    title: game.i18n.format("ORGANIZR.Build.Card.Title", { name: view.name }),
    groups: view.groups.map(localizedGroup)
  };
}

function localizedGroup(group) {
  return { title: game.i18n.format(group.titleKey, titleData(group)), rows: group.rows.map(localizedRow) };
}

function titleData(group) {
  if (group.id !== "manual") return group.titleData;
  const reason = game.i18n.localize(`ORGANIZR.Build.Card.ManualReasons.${group.titleData.reason}`);
  return { reason };
}

function localizedRow(row) {
  if (!row.count) return row;
  const text = game.i18n.format("ORGANIZR.Build.Card.MatchCount", { name: row.text, count: row.count });
  return { label: row.label, text };
}

function listLabels() {
  const labels = {};
  for (const list of REPORT_LISTS) labels[list] = game.i18n.localize(`ORGANIZR.Build.Lists.${list}`);
  return labels;
}

function differenceText(key) {
  const label = differenceLabel(key);
  if (label.langKey) return game.i18n.format(label.langKey, label.data);
  if (label.skill) return skillLabel(label.skill);
  return label.text;
}

function skillLabel(slug) {
  const label = CONFIG.PF2E?.skills?.[slug]?.label;
  return label ? game.i18n.localize(label) : slug;
}
