import { test } from "node:test";
import assert from "node:assert/strict";
import {
  batchPlan, filterSheets, groupSheets, importableFileIds, importableSheets, listErrorKey, worldActorId
} from "../scripts/service/SheetCatalog.mjs";

const entries = [
  { fileId: 1, projectId: 10, projectName: "Dragonfall", type: "npc", name: "Goblin Warrior", level: "1", imageFileId: 5, uuid: null, tags: ["goblin", "humanoid"], updatedAt: "2026-10-01T00:00:00Z" },
  { fileId: 2, projectId: 10, projectName: "Dragonfall", type: "npc", name: "Ogre", level: "3", imageFileId: null, uuid: null, tags: [], updatedAt: null },
  { fileId: 3, projectId: 10, projectName: "Dragonfall", type: "spell", name: "Fireball", level: "3", imageFileId: null, uuid: null, tags: ["evocation"], updatedAt: null },
  { fileId: 4, projectId: 20, projectName: "Sea of Stars", type: "character", name: "Mara", level: "4", imageFileId: 9, uuid: "Actor.Ab12Cd34Ef56Gh78", tags: [], updatedAt: null }
];

test("filterSheets matches every word against name, type, level, tags and project, case-insensitively", () => {
  assert.deepEqual(filterSheets(entries, "GOBLIN").map((e) => e.fileId), [1]);
  assert.deepEqual(filterSheets(entries, "npc 3").map((e) => e.fileId), [2]);
  assert.deepEqual(filterSheets(entries, "evocation").map((e) => e.fileId), [3]);
  assert.deepEqual(filterSheets(entries, "sea stars").map((e) => e.fileId), [4]);
  assert.deepEqual(filterSheets(entries, "nothing-here"), []);
});

test("an empty or whitespace term keeps everything and missing entries give an empty list", () => {
  assert.equal(filterSheets(entries, "").length, 4);
  assert.equal(filterSheets(entries, "   ").length, 4);
  assert.deepEqual(filterSheets(undefined, "x"), []);
});

test("groupSheets nests projects then types in server order with counts and row data", () => {
  const projects = groupSheets(entries);
  assert.deepEqual(projects.map((p) => [p.projectName, p.count]), [["Dragonfall", 3], ["Sea of Stars", 1]]);
  assert.deepEqual(projects[0].types.map((t) => t.type), ["npc", "spell"]);
  assert.equal(projects[0].types[0].labelKey, "ORGANIZR.Browser.Types.npc");
  assert.deepEqual(projects[0].types[0].sheets[0], {
    fileId: 1, type: "npc", importable: true, name: "Goblin Warrior", level: "1", imageFileId: 5,
    tags: ["goblin", "humanoid"], uuid: null, worldActorId: null, updatedAt: "2026-10-01T00:00:00Z"
  });
  assert.equal(projects[1].types[0].sheets[0].worldActorId, "Ab12Cd34Ef56Gh78");
  assert.equal(projects[1].types[0].sheets[0].uuid, "Actor.Ab12Cd34Ef56Gh78");
  assert.equal(projects[1].types[0].sheets[0].importable, false);
});

test("groups and projects count their importable sheets and expose their file ids", () => {
  const projects = groupSheets(entries);
  assert.equal(projects[0].importableCount, 3);
  assert.deepEqual(projects[0].types.map((t) => t.importableCount), [2, 1]);
  assert.equal(projects[1].importableCount, 0);
  assert.deepEqual(importableFileIds(projects, 10), [1, 2, 3]);
  assert.deepEqual(importableFileIds(projects, "10", "npc"), [1, 2]);
  assert.deepEqual(importableFileIds(projects, 20), []);
  assert.deepEqual(importableFileIds(projects, 99), []);
});

test("unknown types get no label key and missing fields default safely", () => {
  const [project] = groupSheets([{ fileId: 7, projectId: 1, type: "weird", name: "X" }]);
  assert.equal(project.types[0].labelKey, null);
  assert.equal(project.types[0].type, "weird");
  assert.equal(project.projectName, "");
  assert.deepEqual(project.types[0].sheets[0].tags, []);
  assert.equal(project.types[0].sheets[0].level, null);
});

test("worldActorId only accepts plain world actor uuids", () => {
  assert.equal(worldActorId("Actor.Ab12Cd34Ef56Gh78"), "Ab12Cd34Ef56Gh78");
  assert.equal(worldActorId("Scene.S1.Token.T1.Actor.Ab12"), null);
  assert.equal(worldActorId("Actor.Ab12.Item.I1"), null);
  assert.equal(worldActorId(null), null);
});

test("listErrorKey maps statuses to localization keys", () => {
  assert.equal(listErrorKey(0), "ORGANIZR.Browser.Errors.Unreachable");
  assert.equal(listErrorKey(401), "ORGANIZR.Browser.Errors.TokenRejected");
  assert.equal(listErrorKey(403), "ORGANIZR.Browser.Errors.Forbidden");
  assert.equal(listErrorKey(500), "ORGANIZR.Browser.Errors.ServerError");
});

test("importableSheets returns the importable rows of a project or type group", () => {
  const projects = groupSheets(entries);
  assert.deepEqual(importableSheets(projects, 10).map((sheet) => sheet.fileId), [1, 2, 3]);
  assert.deepEqual(importableSheets(projects, 10, "spell").map((sheet) => sheet.name), ["Fireball"]);
  assert.deepEqual(importableSheets(projects, 20), []);
});

const batch = [
  { fileId: 1, type: "npc", uuid: "Actor.N1" },
  { fileId: 2, type: "loot", uuid: "Actor.L1" },
  { fileId: 3, type: "item", uuid: null },
  { fileId: 4, type: "loot", uuid: null }
];

test("loot2 batchPlan skips linked loot unless restoring", () => {
  const linked = new Map([["1", []], ["2", []]]);
  const plan = batchPlan(batch, linked, false);
  assert.deepEqual(plan.create.map((sheet) => sheet.fileId), [3, 4]);
  assert.deepEqual(plan.refresh.map((sheet) => sheet.fileId), [1]);
  assert.deepEqual(plan.skippedLoot.map((sheet) => sheet.fileId), [2]);

  const restoring = batchPlan(batch, linked, true);
  assert.deepEqual(restoring.refresh.map((sheet) => sheet.fileId), [1, 2]);
  assert.deepEqual(restoring.skippedLoot, []);
  assert.equal(restoring.refresh[1].uuid, "Actor.L1");
});

test("batchPlan creates everything when nothing is linked and accepts a Set of ids", () => {
  const plan = batchPlan(batch, new Set());
  assert.equal(plan.create.length, 4);
  assert.deepEqual(plan.refresh, []);
  assert.deepEqual(batchPlan([], new Set(["1"])), { create: [], refresh: [], skippedLoot: [] });
});
