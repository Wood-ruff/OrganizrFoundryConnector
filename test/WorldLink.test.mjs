import { test } from "node:test";
import assert from "node:assert/strict";
import { isWorldLinked, maskToken, normalizeWorldLink } from "../scripts/service/WorldLink.mjs";

test("normalizes whitespace and trailing slashes", () => {
  const { link, errors } = normalizeWorldLink({
    serverUrl: "  https://organizr.example/// ", apiToken: " org_abc ", projectId: " 12 "
  });
  assert.deepEqual(link, { serverUrl: "https://organizr.example", apiToken: "org_abc", projectId: "12" });
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
  assert.deepEqual(normalizeWorldLink({ serverUrl: "https://host/?x=" }).errors, ["ORGANIZR.Settings.Errors.InvalidUrl"]);
  assert.deepEqual(normalizeWorldLink({ serverUrl: "https://host/#frag" }).errors, ["ORGANIZR.Settings.Errors.InvalidUrl"]);
  assert.deepEqual(normalizeWorldLink({ serverUrl: "https://user:pw@host" }).errors, ["ORGANIZR.Settings.Errors.InvalidUrl"]);
  assert.deepEqual(normalizeWorldLink({ serverUrl: "http://localhost:8090/" }).errors, []);
});

test("rejects a non-numeric project id and a token without the org_ prefix", () => {
  assert.deepEqual(normalizeWorldLink({ projectId: "abc" }).errors, ["ORGANIZR.Settings.Errors.InvalidProjectId"]);
  assert.deepEqual(normalizeWorldLink({ apiToken: "jwt.token.here" }).errors, ["ORGANIZR.Settings.Errors.InvalidToken"]);
  assert.deepEqual(normalizeWorldLink({ projectId: "12", apiToken: "org_abc" }).errors, []);
});

test("a world is linked once it has a URL, a project and a token", () => {
  assert.equal(isWorldLinked({ serverUrl: "https://x", projectId: "1", apiToken: "org_t" }), true);
  assert.equal(isWorldLinked({ serverUrl: "https://x", projectId: "1", apiToken: "" }), false);
  assert.equal(isWorldLinked({ serverUrl: "https://x", projectId: "", apiToken: "org_t" }), false);
  assert.equal(isWorldLinked({ serverUrl: "", projectId: "1", apiToken: "org_t" }), false);
});

test("tokens are masked to prefix and last four characters", () => {
  assert.equal(maskToken(""), "");
  assert.equal(maskToken("org_abc"), "****");
  assert.equal(maskToken("org_secret-token-1234"), "org_****1234");
});
