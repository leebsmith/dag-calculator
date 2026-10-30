// Hops card section state: boil and whirlpool are independent disclosures, and
// each header carries its addition count plus the IBU target it allocates.

import { countLabel, formatQuantity } from "../../utils.js";

function sectionMeta(rows, ibuField) {
  const additions = countLabel(rows.length, "addition");
  if (!rows.length) return additions;
  return `${additions} · ${formatQuantity(ibuField, { fallbackUnit: "IBU" })}`;
}

export function hopSectionState() {
  return {
    hopSections: { boil: true, whirlpool: true },

    toggleHopSection(sectionId) {
      this.hopSections[sectionId] = !this.hopSections[sectionId];
    },

    isHopSectionOpen(sectionId) {
      return !!this.hopSections[sectionId];
    },
  };
}

export function hopSectionMetaDescriptors() {
  return {
    boilHopSectionMeta: {
      configurable: true,
      get() {
        return sectionMeta(this.hopRows, this.boilIbuField);
      },
    },
    whirlpoolHopSectionMeta: {
      configurable: true,
      get() {
        return sectionMeta(this.whirlpoolHopRows, this.whirlpoolIbuField);
      },
    },
  };
}
