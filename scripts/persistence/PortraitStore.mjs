const PORTRAIT_FOLDER = "organizr-portraits";

/** Stores an image blob in this world's data folder and returns the Foundry path to use as `img`. */
export async function storePortrait(blob, fileName) {
  const FilePicker = foundry.applications.apps.FilePicker.implementation;
  const directory = `worlds/${game.world.id}/${PORTRAIT_FOLDER}`;
  await ensureDirectory(FilePicker, directory);
  const file = new File([blob], fileName, { type: blob.type });
  const response = await FilePicker.upload("data", directory, file, {}, { notify: false });
  if (!response?.path) throw new Error("Foundry refused the upload");
  return response.path;
}

async function ensureDirectory(FilePicker, directory) {
  try {
    await FilePicker.browse("data", directory);
  } catch {
    await FilePicker.createDirectory("data", directory);
  }
}
