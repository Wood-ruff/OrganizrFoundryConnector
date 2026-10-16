/** Error from the Organizr server: HTTP status (0 = no response) plus the server's message when it sent one. */
export class OrganizrRequestError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "OrganizrRequestError";
    this.status = status;
  }
}

/** HTTP client for the Organizr connector endpoints; `fetchImpl` is injectable for tests. */
export function createOrganizrClient(fetchImpl = globalThis.fetch) {
  return {
    async pushCharacter({ serverUrl, apiToken, projectId }, body, folderId) {
      const query = folderId ? `?folderId=${encodeURIComponent(folderId)}` : "";
      const url = `${serverUrl}/api/foundry/projects/${encodeURIComponent(projectId)}/characters${query}`;
      const response = await send(fetchImpl, url, apiToken, { method: "POST", body });
      return readJson(response);
    },

    async pushCombat({ serverUrl, apiToken, projectId }, body) {
      const url = `${serverUrl}/api/foundry/projects/${encodeURIComponent(projectId)}/combats`;
      const response = await send(fetchImpl, url, apiToken, { method: "POST", body });
      return readJson(response);
    },

    async moveCombat({ serverUrl, apiToken, projectId }, action) {
      const url = `${serverUrl}/api/foundry/projects/${encodeURIComponent(projectId)}/combat/${action}`;
      const response = await send(fetchImpl, url, apiToken, { method: "POST" });
      return readJson(response);
    },

    async endCombat({ serverUrl, apiToken, projectId }) {
      const url = `${serverUrl}/api/foundry/projects/${encodeURIComponent(projectId)}/combat`;
      await send(fetchImpl, url, apiToken, { method: "DELETE" });
    },

    async pushCombatantState({ serverUrl, apiToken, projectId }, combatantId, body) {
      const url = `${serverUrl}/api/foundry/projects/${encodeURIComponent(projectId)}/combat/combatants/${encodeURIComponent(combatantId)}`;
      const response = await send(fetchImpl, url, apiToken, { method: "PUT", body });
      return readJson(response);
    },

    async listSheets({ serverUrl, apiToken }, projectId) {
      const query = projectId ? `?project=${encodeURIComponent(projectId)}` : "";
      const response = await send(fetchImpl, `${serverUrl}/api/foundry/sheets${query}`, apiToken, { method: "GET" });
      return readJson(response);
    },

    async fetchFoundryDocument({ serverUrl, apiToken }, fileId, systemId) {
      const query = systemId ? `?system=${encodeURIComponent(systemId)}` : "";
      const url = `${serverUrl}/api/foundry/sheets/${encodeURIComponent(fileId)}/foundry${query}`;
      const response = await send(fetchImpl, url, apiToken, { method: "GET" });
      return readJson(response);
    },

    async linkSheet({ serverUrl, apiToken }, fileId, body) {
      const url = `${serverUrl}/api/foundry/sheets/${encodeURIComponent(fileId)}/link`;
      const response = await send(fetchImpl, url, apiToken, { method: "POST", body });
      return readJson(response);
    },

    async fetchFileBlob({ serverUrl, apiToken }, fileId) {
      const url = `${serverUrl}/api/foundry/files/${encodeURIComponent(fileId)}/content`;
      const response = await send(fetchImpl, url, apiToken, { method: "GET" });
      return response.blob();
    }
  };
}

async function send(fetchImpl, url, token, { method, body }) {
  const headers = { Authorization: `Bearer ${token}` };
  const init = { method, headers };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  let response;
  try {
    response = await fetchImpl(url, init);
  } catch (error) {
    throw new OrganizrRequestError(0, error.message);
  }
  if (!response.ok) throw new OrganizrRequestError(response.status, await errorMessage(response));
  return response;
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function errorMessage(response) {
  const payload = await readJson(response);
  if (payload && typeof payload.error === "string") return payload.error;
  return `HTTP ${response.status}`;
}
