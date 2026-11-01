import { tokenFollowsImage } from "./SheetImport.mjs";
import { FACT_KEYS, TEXT_KEYS } from "./Pf2eActorSeed.mjs";

const BOOST_LEVELS = ["1", "5", "10", "15", "20"];

/**
 * The update that turns a linked actor into the rebuilt one before its items are written: the seed's name, flags and
 * system data (level, XP, biography, languages, skill ranks, boosts or manual attributes) and its image when it has
 * one, which the prototype token follows when it showed the actor image. With boosts, the manual attributes are
 * cleared (`system.abilities: null`, pf2e's own way out of manual mode) and boost levels the plan leaves out emptied.
 * Biography texts and facts the seed leaves out are written empty, so Foundry's biography matches Organizr's.
 */
export function actorRefreshUpdate(seed, currentSource) {
  const update = {
    name: seed?.name,
    flags: structuredClone(seed?.flags ?? {}),
    system: structuredClone(seed?.system ?? {})
  };
  const boosts = update.system.build?.attributes?.boosts;
  if (boosts) {
    for (const level of BOOST_LEVELS) boosts[level] = boosts[level] ?? [];
    update.system.abilities = null;
  }
  if (update.system.details) clearOmittedBiography(update.system.details);
  if (seed?.img) addImage(update, seed.img, currentSource);
  return update;
}

function clearOmittedBiography(details) {
  details.biography = details.biography ?? {};
  for (const key of TEXT_KEYS) details.biography[key] = details.biography[key] ?? "";
  for (const key of FACT_KEYS) details[key] = details[key] ?? { value: "" };
}

function addImage(update, img, currentSource) {
  update.img = img;
  const textureSrc = currentSource?.prototypeToken?.texture?.src;
  if (tokenFollowsImage(textureSrc, currentSource?.img)) update.prototypeToken = { texture: { src: img } };
}
