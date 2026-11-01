/**
 * An error for a build refusal or failure: `buildKey` and `buildData` make the user's notice, the formatted message is
 * for the console and for callers that pass it on as a format value.
 */
export function buildError(key, data) {
  const error = new Error(game.i18n.format(key, data));
  error.buildKey = key;
  error.buildData = data;
  return error;
}

/** Shows a build error as a localized notice; Foundry escapes its values, so names from Organizr stay plain text. */
export function notifyBuildError(error) {
  ui.notifications.error(error.buildKey, { localize: true, format: error.buildData ?? {} });
}
