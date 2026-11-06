// Style target getters: the planned-bitterness balance and its drift notes.
// Split from the pin/slider handlers so each module stays a readable unit.

import { formatIbu, formatIbuGu, ibuDrift, plannedIbuGu, whirlpoolPercent } from "../../../views/styleTargetsLogic.js";
import { STYLE_NODES as N } from "../../../views/registry/style.js";
import { provenanceFor } from "../../../utils.js";

export function ibuDescriptors({ getView }) {
  return {
    ibuTargetOutside: {
      configurable: true,
      get() {
        const view = getView();
        return ibuDrift({ target: view.targetIbu, bounds: view.styleIbuBounds }).outside;
      },
    },
    ibuTargetNote: {
      configurable: true,
      get() {
        const view = getView();
        return ibuDrift({ target: view.targetIbu, bounds: view.styleIbuBounds }).text;
      },
    },
    ibuTargetField: {
      configurable: true,
      get() {
        return getView().fieldsById?.[N.targets.ibu] ?? null;
      },
    },
    ibuTargetProvenance: {
      configurable: true,
      get() {
        return provenanceFor(getView().ibuTargetField);
      },
    },
    // Planned bitterness balance: planned IBU over the planned OG's gravity
    // units (from the fermentation-target navigator), so it needs no solve.
    ibuGu: {
      configurable: true,
      get() {
        const view = getView();
        return plannedIbuGu(view.targetIbu, view.styleTargetInfo?.og);
      },
    },
    ibuGuDisplay: {
      configurable: true,
      get() {
        return formatIbuGu(getView().ibuGu);
      },
    },
    whirlpoolPctDisplay: {
      configurable: true,
      get() {
        return whirlpoolPercent(getView().whirlpoolFraction);
      },
    },
    boilIbuDisplay: {
      configurable: true,
      get() {
        return formatIbu(getView().boilIbu);
      },
    },
    whirlpoolIbuDisplay: {
      configurable: true,
      get() {
        return formatIbu(getView().whirlpoolIbu);
      },
    },
  };
}

