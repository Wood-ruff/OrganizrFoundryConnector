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
      return postJson(fetchImpl, url, apiToken, body);
    }
  };
}

async function postJson(fetchImpl, url, token, body) {
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
  let response;
  try {
    response = await fetchImpl(url, { method: "POST", headers, body: JSON.stringify(body) });
  } catch (error) {
    throw new OrganizrRequestError(0, error.message);
  }
  const payload = await readJson(response);
  if (!response.ok) throw new OrganizrRequestError(response.status, errorMessage(response, payload));
  return payload;
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function errorMessage(response, payload) {
  if (payload && typeof payload.error === "string") return payload.error;
  return `HTTP ${response.status}`;
}
