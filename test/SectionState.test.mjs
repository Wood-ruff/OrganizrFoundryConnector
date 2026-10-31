import { test } from "node:test";
import assert from "node:assert/strict";
import { isCollapsed, toggleSection, visibleSectionParts } from "../scripts/service/SectionState.mjs";

test("toggling collapses and expands without mutating the input", () => {
  const start = {};
  const collapsed = toggleSection(start, "combat");
  assert.deepEqual(collapsed, { combat: true });
  assert.deepEqual(start, {});
  assert.deepEqual(toggleSection(collapsed, "combat"), {});
});

test("sections are independent", () => {
  const both = toggleSection(toggleSection({}, "combat"), "settings");
  assert.equal(isCollapsed(both, "combat"), true);
  assert.equal(isCollapsed(both, "settings"), true);
  assert.equal(isCollapsed(toggleSection(both, "combat"), "settings"), true);
});

test("unknown or missing state reads as expanded", () => {
  assert.equal(isCollapsed(undefined, "combat"), false);
  assert.equal(isCollapsed({}, "combat"), false);
});

const parts = { combat: {}, characters: {}, sync: {}, settings: {} };

test("players do not get the GM-only settings part", () => {
  assert.deepEqual(Object.keys(visibleSectionParts(parts, false)), ["combat", "characters", "sync"]);
});

test("GMs keep every part in the original order", () => {
  assert.deepEqual(Object.keys(visibleSectionParts(parts, true)), ["combat", "characters", "sync", "settings"]);
});

test("filtering never mutates the input parts", () => {
  visibleSectionParts(parts, false);
  assert.deepEqual(Object.keys(parts), ["combat", "characters", "sync", "settings"]);
});

test("parts without a settings section pass through for players", () => {
  assert.deepEqual(visibleSectionParts({ combat: {} }, false), { combat: {} });
});
