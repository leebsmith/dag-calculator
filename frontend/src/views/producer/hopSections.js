// Hops card section state: boil and whirlpool are independent disclosures, and
// each header carries its addition count plus the IBU target it allocates.

import { countLabel, formatQuantity } from "../../utils.js";

function sectionMeta(rows, ibuField) {
  const additions = countLabel(rows.length, "addition");
  if (!rows.length) return additions;
  return `${additions} · ${formatQuantity(ibuField, { fallbackUnit: "IBU" })}`;
}

export function hopSectionState(getView) {
  return {
    hopSections: { boil: true, whirlpool: true },

    toggleHopSection(sectionId) {
      const view = getView();
      view.hopSections[sectionId] = !view.hopSections[sectionId];
    },

    isHopSectionOpen(sectionId) {
      return !!getView().hopSections[sectionId];
    },
  };
}

export function hopSectionMetaDescriptors(getView) {
  return {
    boilHopSectionMeta: {
      configurable: true,
      get() {
        const view = getView();
        return sectionMeta(view.hopRows, view.boilIbuField);
      },
    },
    whirlpoolHopSectionMeta: {
      configurable: true,
      get() {
        const view = getView();
        return sectionMeta(view.whirlpoolHopRows, view.whirlpoolIbuField);
      },
    },
  };
}
