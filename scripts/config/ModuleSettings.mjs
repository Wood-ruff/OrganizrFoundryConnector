export const MODULE_ID = "organizr-foundry-connector";

export const SETTINGS = {
  serverUrl: "serverUrl",
  apiToken: "apiToken",
  projectId: "projectId",
  collapsedSections: "collapsedSections"
};

/** Registers all module settings; world-scoped ones hold the per-world Organizr link. */
export function registerModuleSettings() {
  game.settings.register(MODULE_ID, SETTINGS.serverUrl, worldString());
  game.settings.register(MODULE_ID, SETTINGS.apiToken, worldString());
  game.settings.register(MODULE_ID, SETTINGS.projectId, worldString());
  game.settings.register(MODULE_ID, SETTINGS.collapsedSections, {
    scope: "client",
    config: false,
    type: Object,
    default: {}
  });
}

function worldString() {
  return { scope: "world", config: false, type: String, default: "" };
}

export function readWorldLink() {
  return {
    serverUrl: game.settings.get(MODULE_ID, SETTINGS.serverUrl),
    apiToken: game.settings.get(MODULE_ID, SETTINGS.apiToken),
    projectId: game.settings.get(MODULE_ID, SETTINGS.projectId)
  };
}

export async function writeWorldLink(link) {
  await game.settings.set(MODULE_ID, SETTINGS.serverUrl, link.serverUrl);
  await game.settings.set(MODULE_ID, SETTINGS.apiToken, link.apiToken);
  await game.settings.set(MODULE_ID, SETTINGS.projectId, link.projectId);
}

export function readCollapsedSections() {
  return game.settings.get(MODULE_ID, SETTINGS.collapsedSections) ?? {};
}

export async function writeCollapsedSections(sections) {
  await game.settings.set(MODULE_ID, SETTINGS.collapsedSections, sections);
}
