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

/** True when the world has enough data to talk to a server. */
export function isWorldLinked(link) {
  return Boolean(link.serverUrl) && Boolean(link.apiToken);
}

/** Masks a token for display, keeping only its last characters. */
export function maskToken(token) {
  if (!token) return "";
  if (token.length <= 4) return "****";
  return "****" + token.slice(-4);
}

function trimmedWithoutTrailingSlash(value) {
  return (value ?? "").trim().replace(/\/+$/, "");
}

function validationErrors(link) {
  const errors = [];
  if (link.serverUrl && !isHttpUrl(link.serverUrl)) errors.push("ORGANIZR.Settings.Errors.InvalidUrl");
  if (link.apiToken && !link.serverUrl) errors.push("ORGANIZR.Settings.Errors.TokenWithoutUrl");
  return errors;
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
