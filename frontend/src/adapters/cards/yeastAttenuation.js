// Selected-strain and batch-attenuation descriptors for the yeast card.

import { displayValue } from "../../views/producer.js";
import {
  attenuationBandLabel,
  attenuationLabel,
  normalizeRangedYeast,
  percentText,
  pofLabel,
  sta1Label,
  temperatureRangeLabel,
} from "../../views/producer/yeastRows.js";
import { YEAST_NODES as N } from "../../views/registry/yeast.js";
import { UNIT_SYMBOLS, masterUnit, unitDecimals } from "../../views/registry/units.js";
import {
  formatWithDecimals,
  joinNonEmpty,
  toPercentValue,
  unitSymbol,
} from "../../utils.js";

export function createYeastAttenuationDescriptors({ cache, artifact, nl, getView }) {
  return {
    selectedYeast: {
      configurable: true,
      get() {
        const id = getView().selectedYeastId;
        if (!id) return null;
        const live = cache.references.yeast[id] ?? null;
        if (live) return normalizeRangedYeast(live);
        const snapshot = getView().selectedYeastSnapshot;
        if (!snapshot) return null;
        if (
          snapshot.attenuation_cap_pct === undefined &&
          typeof snapshot.attenuation_pct === "number"
        ) {
          return normalizeRangedYeast({
            ...snapshot,
            attenuation_cap_pct: snapshot.attenuation_pct,
          });
        }
        return normalizeRangedYeast(snapshot);
      },
    },
    selectedYeastPublished: {
      configurable: true,
      get() {
        const yeast = getView().selectedYeast;
        return attenuationBandLabel(yeast) || attenuationLabel(yeast);
      },
    },
    selectedYeastMeta: {
      configurable: true,
      get() {
        const view = getView();
        const yeast = view.selectedYeast;
        if (!yeast) return "";
        const flocculation = yeast.flocculation ? `${yeast.flocculation} flocculation` : "";
        return joinNonEmpty([
          yeast.manufacturer,
          yeast.form,
          flocculation,
          view.selectedYeastTemp,
        ]);
      },
    },
    selectedYeastTemp: {
      configurable: true,
      get() {
        const view = getView();
        const unitId = masterUnit(view.unitMode, "temperature") ?? "degC";
        return temperatureRangeLabel(view.selectedYeast, {
          toDisplay: (value) => displayValue(artifact, "temperature", unitId, value, nl),
          symbol: unitSymbol(UNIT_SYMBOLS, "temperature", unitId),
          decimals: unitDecimals("temperature", unitId) ?? 1,
        });
      },
    },
    // The derate is percentage points, not a fraction: the input must not follow
    // the percentage menu (a `fraction` pick would show 0.04 beside step 0.5).
    yeastDerateDisplay: {
      configurable: true,
      get() {
        return percentText(getView().yeastField(N.derate).value ?? 0);
      },
    },
    selectedYeastSta1: {
      configurable: true,
      get() {
        return sta1Label(getView().selectedYeast);
      },
    },
    selectedYeastPof: {
      configurable: true,
      get() {
        return pofLabel(getView().selectedYeast);
      },
    },
    attenuationCapValue: {
      configurable: true,
      get() {
        return getView().fieldsById?.[N.cap]?.value;
      },
    },
    attenuationRealizedValue: {
      configurable: true,
      get() {
        return getView().fieldsById?.[N.realized]?.value;
      },
    },
    attenuationGristValue: {
      configurable: true,
      get() {
        return getView().fieldsById?.[N.gristAttenuation]?.value;
      },
    },
    attenuationAboveCap: {
      configurable: true,
      get() {
        const value = getView().fieldsById?.[N.aboveCap]?.value;
        return typeof value === "number" && value > 0 ? value : null;
      },
    },
    attenuationAboveCapLabel: {
      configurable: true,
      get() {
        const value = getView().attenuationAboveCap;
        return value == null
          ? ""
          : `+${formatWithDecimals(toPercentValue(value, 1), 1)} pts`;
      },
    },
    attenuationAboveCapCause: {
      configurable: true,
      get() {
        const view = getView();
        if (view.attenuationAboveCap == null) return "";
        const sugar = Number(view.fieldsById?.[N.sugarExtract]?.value) || 0;
        return sugar > 0 ? "sugar" : "";
      },
    },
    attenuationBinding: {
      configurable: true,
      get() {
        const view = getView();
        if (view.attenuationAboveCap != null) return view.attenuationAboveCapCause;
        const cap = view.attenuationCapValue;
        const grist = view.attenuationGristValue;
        if (typeof cap === "number" && typeof grist === "number" && grist < cap - 1e-9) {
          return "grist-limited";
        }
        return cap == null ? "" : "yeast cap";
      },
    },
  };
}
