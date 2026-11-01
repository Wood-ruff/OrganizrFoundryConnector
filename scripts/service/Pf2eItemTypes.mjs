/** The pf2e item types of a character's identity (ancestry, heritage, background, class, deity), in build order. */
export const IDENTITY_KINDS = Object.freeze(["ancestry", "heritage", "background", "class", "deity"]);

/** The pf2e physical item types: what an inventory entry may match and what a rebuild keeps quantities of. */
export const PHYSICAL_TYPES = Object.freeze([
  "armor", "shield", "weapon", "equipment", "consumable", "treasure", "backpack", "ammo", "book"
]);

/** Whether the item source is one of pf2e's coin stacks (a treasure of the coin category). */
export function isCoinItem(itemSource) {
  return itemSource?.type === "treasure" && itemSource?.system?.category === "coin";
}
