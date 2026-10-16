import { test } from "node:test";
import assert from "node:assert/strict";
import { createOrganizrClient, OrganizrRequestError } from "../scripts/client/OrganizrClient.mjs";

const link = { serverUrl: "https://organizr.example", apiToken: "org_secret", projectId: "12" };

function fakeFetch(status, payload, calls) {
  return async (url, init) => {
    calls.push({ url, init });
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => {
        if (payload === undefined) throw new Error("no body");
        return payload;
      }
    };
  };
}

test("pushCharacter posts the body as JSON with the bearer token to the project path", async () => {
  const calls = [];
  const client = createOrganizrClient(fakeFetch(200, { characterFileId: 1, synced: false }, calls));

  const result = await client.pushCharacter(link, { name: "Mara", uuid: "Actor.A1" });

  assert.deepEqual(result, { characterFileId: 1, synced: false });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://organizr.example/api/foundry/projects/12/characters");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers.Authorization, "Bearer org_secret");
  assert.equal(calls[0].init.headers["Content-Type"], "application/json");
  assert.equal(calls[0].init.body, '{"name":"Mara","uuid":"Actor.A1"}');
});

test("an optional folder id becomes a query parameter", async () => {
  const calls = [];
  await createOrganizrClient(fakeFetch(200, {}, calls)).pushCharacter(link, {}, 44);
  assert.equal(calls[0].url, "https://organizr.example/api/foundry/projects/12/characters?folderId=44");
});

test("server errors surface status and the server's message", async () => {
  const client = createOrganizrClient(fakeFetch(400, { error: "A character needs a uuid" }, []));
  await assert.rejects(client.pushCharacter(link, {}), (error) => {
    assert.ok(error instanceof OrganizrRequestError);
    assert.equal(error.status, 400);
    assert.equal(error.message, "A character needs a uuid");
    return true;
  });
});

test("errors without a JSON body fall back to the HTTP status", async () => {
  const client = createOrganizrClient(fakeFetch(401, undefined, []));
  await assert.rejects(client.pushCharacter(link, {}), { status: 401, message: "HTTP 401" });
});

test("a network failure is status 0 with the fetch message", async () => {
  const client = createOrganizrClient(async () => { throw new TypeError("Failed to fetch"); });
  await assert.rejects(client.pushCharacter(link, {}), { status: 0, message: "Failed to fetch" });
});

test("listSheets gets the sheet list with the bearer token, optionally narrowed to a project", async () => {
  const calls = [];
  const client = createOrganizrClient(fakeFetch(200, [{ fileId: 1 }], calls));

  const all = await client.listSheets(link);
  await client.listSheets(link, "12");

  assert.deepEqual(all, [{ fileId: 1 }]);
  assert.equal(calls[0].url, "https://organizr.example/api/foundry/sheets");
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[0].init.headers.Authorization, "Bearer org_secret");
  assert.equal("Content-Type" in calls[0].init.headers, false);
  assert.equal(calls[0].init.body, undefined);
  assert.equal(calls[1].url, "https://organizr.example/api/foundry/sheets?project=12");
});

test("fetchFileBlob streams a file's content as a blob with the bearer token", async () => {
  const calls = [];
  const blob = { size: 3 };
  const client = createOrganizrClient(async (url, init) => {
    calls.push({ url, init });
    return { ok: true, status: 200, blob: async () => blob };
  });

  assert.equal(await client.fetchFileBlob(link, 77), blob);
  assert.equal(calls[0].url, "https://organizr.example/api/foundry/files/77/content");
  assert.equal(calls[0].init.headers.Authorization, "Bearer org_secret");
});

test("a rejected file request surfaces the status", async () => {
  const client = createOrganizrClient(fakeFetch(403, { error: "Not your project" }, []));
  await assert.rejects(client.fetchFileBlob(link, 77), { status: 403, message: "Not your project" });
});

test("fetchFoundryDocument gets the sheet's Foundry document for the world's system", async () => {
  const calls = [];
  const client = createOrganizrClient(fakeFetch(200, { name: "Goblin", type: "npc" }, calls));
  const document = await client.fetchFoundryDocument(link, 5, "pf2e");
  assert.deepEqual(document, { name: "Goblin", type: "npc" });
  assert.equal(calls[0].url, "https://organizr.example/api/foundry/sheets/5/foundry?system=pf2e");
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[0].init.headers.Authorization, "Bearer org_secret");
});

test("a 422 from the document endpoint carries the server's reason", async () => {
  const client = createOrganizrClient(fakeFetch(422, { error: "\"Guard.npc\" is a dnd5e sheet; this world runs pf2e" }, []));
  await assert.rejects(client.fetchFoundryDocument(link, 5, "pf2e"), { status: 422, message: "\"Guard.npc\" is a dnd5e sheet; this world runs pf2e" });
});

test("linkSheet posts the Foundry uuid to the sheet's link path", async () => {
  const calls = [];
  const client = createOrganizrClient(fakeFetch(200, { fileId: 5, uuid: "Actor.Ab12" }, calls));
  const result = await client.linkSheet(link, 5, { uuid: "Actor.Ab12", worldId: "w" });
  assert.deepEqual(result, { fileId: 5, uuid: "Actor.Ab12" });
  assert.equal(calls[0].url, "https://organizr.example/api/foundry/sheets/5/link");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.body, '{"uuid":"Actor.Ab12","worldId":"w"}');
});

test("pushCombat posts the combat payload to the project's combats path", async () => {
  const calls = [];
  const client = createOrganizrClient(fakeFetch(200, { ok: true }, calls));
  await client.pushCombat(link, { event: { type: "start" }, combatants: [] });
  assert.equal(calls[0].url, "https://organizr.example/api/foundry/projects/12/combats");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers.Authorization, "Bearer org_secret");
  assert.equal(calls[0].init.body, '{"event":{"type":"start"},"combatants":[]}');
});

test("combat moves post to the action path without a body, end sends DELETE", async () => {
  const calls = [];
  const client = createOrganizrClient(fakeFetch(200, { round: 2 }, calls));
  await client.moveCombat(link, "next-turn");
  await client.endCombat(link);
  assert.equal(calls[0].url, "https://organizr.example/api/foundry/projects/12/combat/next-turn");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.body, undefined);
  assert.equal("Content-Type" in calls[0].init.headers, false);
  assert.equal(calls[1].url, "https://organizr.example/api/foundry/projects/12/combat");
  assert.equal(calls[1].init.method, "DELETE");
});

test("pushCombatantState PUTs the state to the combatant path", async () => {
  const calls = [];
  const client = createOrganizrClient(fakeFetch(200, {}, calls));
  await client.pushCombatantState(link, "c0", { id: "c0", defeated: true });
  assert.equal(calls[0].url, "https://organizr.example/api/foundry/projects/12/combat/combatants/c0");
  assert.equal(calls[0].init.method, "PUT");
  assert.equal(calls[0].init.body, '{"id":"c0","defeated":true}');
});
