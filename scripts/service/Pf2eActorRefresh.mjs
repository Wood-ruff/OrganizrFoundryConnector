import { tokenFollowsImage } from "./SheetImport.mjs";

const BOOST_LEVELS = ["1", "5", "10", "15", "20"];

/**
 * The update that turns a linked actor into the rebuilt one before its items are written: the seed's name, flags and
 * system data (level, XP, biography, languages, skill ranks, boosts or manual attributes) and its image when it has
 * one, which the prototype token follows when it showed the actor image. With boosts, the manual attributes are
 * cleared (`system.abilities: null`, pf2e's own way out of manual mode) and boost levels the plan leaves out emptied.
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
  if (seed?.img) addImage(update, seed.img, currentSource);
  return update;
}

function addImage(update, img, currentSource) {
  update.img = img;
  const textureSrc = currentSource?.prototypeToken?.texture?.src;
  if (tokenFollowsImage(textureSrc, currentSource?.img)) update.prototypeToken = { texture: { src: img } };
}
