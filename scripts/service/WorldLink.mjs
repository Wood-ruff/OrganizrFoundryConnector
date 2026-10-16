const TOKEN_PREFIX = "org_";

/**
 * Normalizes and validates the per-world Organizr link form; returns { link, errors }.
 * A blank token field keeps the token already stored, so edits to the other fields never wipe it.
 */
export function normalizeWorldLink(input, existingToken = "") {
  const typedToken = (input.apiToken ?? "").trim();
  const link = {
    serverUrl: trimmedWithoutTrailingSlash(input.serverUrl),
    apiToken: typedToken || existingToken,
    projectId: (input.projectId ?? "").trim()
  };
  return { link, errors: validationErrors(link) };
}

/** True when the world has everything a push needs: server, project and token. */
export function isWorldLinked(link) {
  return Boolean(link.serverUrl) && Boolean(link.projectId) && Boolean(link.apiToken);
}

/** Masks a token for display, keeping its prefix and last characters. */
export function maskToken(token) {
  if (!token) return "";
  if (token.length <= 8) return "****";
  return token.slice(0, 4) + "****" + token.slice(-4);
}

function trimmedWithoutTrailingSlash(value) {
  return (value ?? "").trim().replace(/\/+$/, "");
}

function validationErrors(link) {
  const errors = [];
  if (link.serverUrl && !isHttpUrl(link.serverUrl)) errors.push("ORGANIZR.Settings.Errors.InvalidUrl");
  if (link.projectId && !/^\d+$/.test(link.projectId)) errors.push("ORGANIZR.Settings.Errors.InvalidProjectId");
  if (link.apiToken && !link.apiToken.startsWith(TOKEN_PREFIX)) errors.push("ORGANIZR.Settings.Errors.InvalidToken");
  return errors;
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    const isHttp = url.protocol === "http:" || url.protocol === "https:";
    const isPlain = !url.search && !url.hash && !url.username && !url.password;
    return isHttp && isPlain;
  } catch {
    return false;
  }
}
