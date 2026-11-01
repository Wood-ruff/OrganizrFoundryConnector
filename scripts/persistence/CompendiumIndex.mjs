const INDEX_FIELDS = ["system.slug", "system.category", "system.level.value"];
const indexes = new Map();

/**
 * The index rows of a compendium pack as `{id, uuid, name, type, slug, category, level, pack}`, read once per session
 * (a failed read is retried next time); a pack this world lacks has no rows.
 */
export function indexRows(packId) {
  if (!indexes.has(packId)) indexes.set(packId, readIndexRows(packId));
  return indexes.get(packId);
}

/** The source data of these documents of a pack, loaded in one request; unknown ids are left out. */
export async function packSources(packId, ids) {
  const pack = game.packs.get(packId);
  const wanted = [...new Set(ids ?? [])];
  if (!pack || wanted.length === 0) return [];
  const documents = await pack.getDocuments({ _id__in: wanted });
  return documents.map((document) => document.toObject());
}

/** One pack index entry as a match row. */
export function indexRow(entry, packId) {
  return {
    id: entry._id,
    uuid: entry.uuid ?? `Compendium.${packId}.Item.${entry._id}`,
    name: entry.name ?? "",
    type: entry.type ?? "",
    slug: entry.system?.slug ?? null,
    category: entry.system?.category ?? null,
    level: entry.system?.level?.value ?? null,
    pack: packId
  };
}

async function readIndexRows(packId) {
  const pack = game.packs.get(packId);
  if (!pack) return [];
  try {
    const index = await pack.getIndex({ fields: INDEX_FIELDS });
    return Array.from(index.values(), (entry) => indexRow(entry, packId));
  } catch (error) {
    indexes.delete(packId);
    throw error;
  }
}
