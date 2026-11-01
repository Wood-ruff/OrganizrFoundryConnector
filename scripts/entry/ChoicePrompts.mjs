import { answerChoice } from "../service/ChoiceAnswers.mjs";

const PROMPT_HOOK = "renderPickAThingPrompt";
const FALLBACK_HOOK = "renderApplicationV2";

/**
 * Runs `fn` while every pf2e choice prompt that opens is answered from the recipe evidence and closed at once; each
 * prompt is recorded in `outcome.prompts` as `{item, choice, how}` (`choice` = the picked label, null when none).
 */
export async function withChoicePrompts(evidence, outcome, fn) {
  const prompts = recordedPrompts(outcome);
  const seen = new WeakSet();
  const onRender = (app) => {
    if (!isChoicePrompt(app) || seen.has(app)) return;
    seen.add(app);
    prompts.push(answerPrompt(app, evidence));
  };
  const hooks = [PROMPT_HOOK, FALLBACK_HOOK].map((hook) => [hook, Hooks.on(hook, onRender)]);
  try {
    return await fn();
  } finally {
    for (const [hook, id] of hooks) Hooks.off(hook, id);
  }
}

/** Whether a rendered application is a pf2e pick-a-thing prompt (choices plus a selection to fill). */
export function isChoicePrompt(app) {
  return Array.isArray(app?.choices) && "selection" in app;
}

/** What the choice answers read of a prompt: the item it belongs to and its choices with localized labels. */
export function promptView(app, localize) {
  const choices = app.choices.map((choice) => ({ value: choice?.value, label: localize(String(choice?.label ?? "")) }));
  return { itemName: app.item?.name ?? "", sourceId: app.item?.sourceId ?? null, choices };
}

function recordedPrompts(outcome) {
  if (!Array.isArray(outcome.prompts)) outcome.prompts = [];
  return outcome.prompts;
}

/** Picks the evidence's answer (or none), closes the prompt so pf2e resolves it, and returns the record. */
function answerPrompt(app, evidence) {
  const { view, answer } = readAnswer(app, evidence);
  app.selection = answer ? app.choices[answer.index] : null;
  app.close({ animate: false });
  if (!answer) return { item: view.itemName, choice: null, how: null };
  return { item: view.itemName, choice: view.choices[answer.index].label, how: answer.how };
}

/** The prompt's view and the evidence's answer; a failure leaves the prompt unanswered instead of open. */
function readAnswer(app, evidence) {
  try {
    const view = promptView(app, (label) => game.i18n.localize(label));
    return { view, answer: answerChoice(view, evidence, game.pf2e.system.sluggify) };
  } catch (error) {
    console.warn("Organizr connector: choice prompt left unanswered", error);
    return { view: { itemName: app.item?.name ?? "", choices: [] }, answer: null };
  }
}
