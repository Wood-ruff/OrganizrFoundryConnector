import { test } from "node:test";
import assert from "node:assert/strict";
import { buildError, notifyBuildError } from "../scripts/entry/BuildErrors.mjs";
import { startBuildNotice } from "../scripts/entry/BuildReport.mjs";

const MARKUP_NAME = "<img src=\"https://example.invalid/p.png\"><a href=\"https://example.invalid\">Fix</a>";

function installFoundry() {
  const calls = [];
  const notice = { updates: [], update(values) { this.updates.push(values); } };
  const record = (type) => (message, options) => {
    calls.push({ type, message, options });
    return notice;
  };
  globalThis.game = { i18n: { format: (key, data) => `${key}|${JSON.stringify(data)}` } };
  globalThis.ui = {
    notifications: { info: record("info"), error: record("error"), remove: (removed) => calls.push({ type: "remove", removed }) }
  };
  return { calls, notice };
}

test("a build error keeps its key and values apart and formats its message for the console", () => {
  installFoundry();
  const data = { name: MARKUP_NAME, message: "boom" };
  const error = buildError("ORGANIZR.Build.Errors.Failed", data);
  assert.equal(error.buildKey, "ORGANIZR.Build.Errors.Failed");
  assert.deepEqual(error.buildData, data);
  assert.equal(error.message, `ORGANIZR.Build.Errors.Failed|${JSON.stringify(data)}`);
});

test("a build error's notice passes the key and the server's names as format values, never as finished text", () => {
  const { calls } = installFoundry();
  notifyBuildError(buildError("ORGANIZR.Build.Errors.NoClass", { name: MARKUP_NAME, className: "<b>Seer</b>" }));
  assert.deepEqual(calls, [{
    type: "error",
    message: "ORGANIZR.Build.Errors.NoClass",
    options: { localize: true, format: { name: MARKUP_NAME, className: "<b>Seer</b>" } }
  }]);
});

test("the running notice passes the character name as a format value and its bar moves and closes", () => {
  const { calls, notice } = installFoundry();
  const running = startBuildNotice(MARKUP_NAME);
  running.advance(0.4);
  running.close();
  assert.deepEqual(calls[0], {
    type: "info",
    message: "ORGANIZR.Build.Running",
    options: { localize: true, format: { name: MARKUP_NAME }, progress: true }
  });
  assert.deepEqual(notice.updates, [{ pct: 0.4 }]);
  assert.deepEqual(calls[1], { type: "remove", removed: notice });
});

test("a running notice without a name shows an empty name", () => {
  const { calls } = installFoundry();
  startBuildNotice(undefined);
  assert.deepEqual(calls[0].options.format, { name: "" });
});
