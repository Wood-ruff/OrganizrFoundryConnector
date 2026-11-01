import { dnd5eDerivedTotals } from "./Dnd5eTotals.mjs";
import { pf1DerivedTotals } from "./Pf1Totals.mjs";
import { pf2eDerivedTotals } from "./Pf2eTotals.mjs";

const PF1_SYSTEM_ID = "pf1";
const PF2E_SYSTEM_ID = "pf2e";
const DND5E_SYSTEM_ID = "dnd5e";
const TOTALS_ACTOR_TYPES = {
  [PF1_SYSTEM_ID]: ["npc", "character"],
  [DND5E_SYSTEM_ID]: ["npc", "character"],
  [PF2E_SYSTEM_ID]: ["character"]
};

/** Whether a send carries the prepared totals: NPC and character actors in a pf1 or dnd5e world, pf2e characters. */
export function sendsDerivedTotals(systemId, documentName, type) {
  if (documentName !== "Actor" || !Object.hasOwn(TOTALS_ACTOR_TYPES, systemId)) return false;
  return TOTALS_ACTOR_TYPES[systemId].includes(type);
}

/**
 * The prepared totals a send of this document carries in this world's system (dnd5e under the given rules version),
 * or null when it carries none.
 */
export function derivedTotalsFor(systemId, document, rulesVersion = "") {
  if (!sendsDerivedTotals(systemId, document?.documentName, document?.type)) return null;
  if (systemId === DND5E_SYSTEM_ID) return dnd5eDerivedTotals(document.system, rulesVersion);
  if (systemId === PF2E_SYSTEM_ID) return pf2eDerivedTotals(document);
  return pf1DerivedTotals(document.system);
}
