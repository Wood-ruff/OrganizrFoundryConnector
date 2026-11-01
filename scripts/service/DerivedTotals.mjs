import { dnd5eDerivedTotals } from "./Dnd5eTotals.mjs";
import { pf1DerivedTotals } from "./Pf1Totals.mjs";

const PF1_SYSTEM_ID = "pf1";
const DND5E_SYSTEM_ID = "dnd5e";
const TOTALS_SYSTEM_IDS = [PF1_SYSTEM_ID, DND5E_SYSTEM_ID];
const TOTALS_ACTOR_TYPES = ["npc", "character"];

/** Whether a send carries the prepared totals: NPC and character actors in a pf1 or dnd5e world. */
export function sendsDerivedTotals(systemId, documentName, type) {
  if (!TOTALS_SYSTEM_IDS.includes(systemId)) return false;
  return documentName === "Actor" && TOTALS_ACTOR_TYPES.includes(type);
}

/**
 * The prepared totals a send of this document carries in this world's system (dnd5e under the given rules version),
 * or null when it carries none.
 */
export function derivedTotalsFor(systemId, document, rulesVersion = "") {
  if (!sendsDerivedTotals(systemId, document?.documentName, document?.type)) return null;
  if (systemId === DND5E_SYSTEM_ID) return dnd5eDerivedTotals(document.system, rulesVersion);
  return pf1DerivedTotals(document.system);
}
