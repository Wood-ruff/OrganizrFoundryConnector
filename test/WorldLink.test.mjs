import { test } from "node:test";
import assert from "node:assert/strict";
import { isWorldLinked, maskToken, normalizeWorldLink } from "../scripts/service/WorldLink.mjs";

test("normalizes whitespace and trailing slashes", () => {
  const { link, errors } = normalizeWorldLink({
    serverUrl: "  https://organizr.example/// ", apiToken: " abc ", projectId: " p1 "
  });
  assert.deepEqual(link, { serverUrl: "https://organizr.example", apiToken: "abc", projectId: "p1" });
  assert.deepEqual(errors, []);
});

test("missing fields become empty strings without errors", () => {
  const { link, errors } = normalizeWorldLink({});
  assert.deepEqual(link, { serverUrl: "", apiToken: "", projectId: "" });
  assert.deepEqual(errors, []);
});

test("a blank token field keeps the stored token, a typed one replaces it", () => {
  assert.equal(normalizeWorldLink({ serverUrl: "https://x", apiToken: "" }, "old").link.apiToken, "old");
  assert.equal(normalizeWorldLink({ serverUrl: "https://x", apiToken: "  " }, "old").link.apiToken, "old");
  assert.equal(normalizeWorldLink({ serverUrl: "https://x", apiToken: "new" }, "old").link.apiToken, "new");
});

test("rejects a server URL that is not http(s)", () => {
  assert.deepEqual(normalizeWorldLink({ serverUrl: "ftp://x" }).errors, ["ORGANIZR.Settings.Errors.InvalidUrl"]);
  assert.deepEqual(normalizeWorldLink({ serverUrl: "organizr" }).errors, ["ORGANIZR.Settings.Errors.InvalidUrl"]);
});

test("rejects a token without a server URL", () => {
  assert.deepEqual(normalizeWorldLink({ apiToken: "t" }).errors, ["ORGANIZR.Settings.Errors.TokenWithoutUrl"]);
});

test("a world is linked once it has a URL and a token", () => {
  assert.equal(isWorldLinked({ serverUrl: "https://x", apiToken: "t" }), true);
  assert.equal(isWorldLinked({ serverUrl: "https://x", apiToken: "" }), false);
  assert.equal(isWorldLinked({ serverUrl: "", apiToken: "t" }), false);
});

test("tokens are masked down to their last four characters", () => {
  assert.equal(maskToken(""), "");
  assert.equal(maskToken("abc"), "****");
  assert.equal(maskToken("secret-token-1234"), "****1234");
});
