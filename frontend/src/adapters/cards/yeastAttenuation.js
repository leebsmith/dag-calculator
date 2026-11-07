// Selected-strain and batch-attenuation descriptors for the yeast card.

import { displayValue } from "../../views/producer.js";
import {
  attenuationBandLabel,
  attenuationLabel,
  percentText,
  pofLabel,
  sta1Label,
  temperatureRangeLabel,
} from "../../views/producer/yeastRows.js";
import { YEAST_NODES as N } from "../../views/registry/yeast.js";
import { UNIT_SYMBOLS, masterUnit, unitDecimals } from "../../views/registry/units.js";
import { formatPercent, joinNonEmpty, roundTo, toPercentValue, unitSymbol } from "../../utils.js";

export function createYeastAttenuationDescriptors({ cache, artifact, nl, getView }) {
  return {
    selectedYeast: {
      configurable: true,
      get() {
        const id = getView().selectedYeastId;
        if (!id) return null;
        const live = cache.references.yeast[id] ?? null;
        if (live) return live;
        const snapshot = getView().selectedYeastSnapshot;
        if (!snapshot) return null;
        if (
          snapshot.attenuation_cap_pct === undefined &&
          typeof snapshot.attenuation_pct === "number"
        ) {
          return { ...snapshot, attenuation_cap_pct: snapshot.attenuation_pct };
        }
        return snapshot;
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
    selectedYeastBand: {
      configurable: true,
      get() {
        return attenuationBandLabel(getView().selectedYeast);
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
    attenuationRange: {
      configurable: true,
      get() {
        const yeast = getView().selectedYeast;
        const low = yeast?.attenuation_low_pct;
        const high = yeast?.attenuation_high_pct;
        return typeof low === "number" && typeof high === "number" ? { low, high } : null;
      },
    },
    attenuationTargetMin: {
      configurable: true,
      get() {
        const range = getView().attenuationRange;
        return range ? toPercentValue(range.low, 1, { dash: 0 }) : 0;
      },
    },
    attenuationTargetMax: {
      configurable: true,
      get() {
        const range = getView().attenuationRange;
        return range ? toPercentValue(range.high, 1, { dash: 0 }) : 0;
      },
    },
    attenuationTargetPercent: {
      configurable: true,
      get() {
        const value = getView().fieldsById?.[N.cap]?.value;
        return typeof value === "number" ? toPercentValue(value, 1, { dash: 0 }) : 0;
      },
    },
    attenuationDraftPercent: {
      configurable: true,
      get() {
        return getView().attenuationDraft ?? getView().attenuationTargetPercent;
      },
    },
    attenuationDraftLabel: {
      configurable: true,
      get() {
        return formatPercent(getView().attenuationDraftPercent / 100, 1);
      },
    },
    attenuationDerateDraft: {
      configurable: true,
      get() {
        const high = getView().attenuationRange?.high;
        if (typeof high !== "number") return 0;
        return roundTo(
          toPercentValue(high, 1, { dash: 0 }) - getView().attenuationDraftPercent,
          1
        ) ?? 0;
      },
    },
    attenuationRangeValid: {
      configurable: true,
      get() {
        const view = getView();
        const range = view.attenuationRange;
        const cap = view.selectedYeast?.attenuation_cap_pct;
        return Boolean(range && typeof cap === "number" && Math.abs(cap - range.high) < 1e-9);
      },
    },
    attenuationUseLabel: {
      configurable: true,
      get() {
        return `Use ${formatPercent(getView().attenuationDraftPercent / 100, 0)}`;
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
        return value == null ? "" : `+${formatPercent(value, 1)}`;
      },
    },
    attenuationAboveCapCause: {
      configurable: true,
      get() {
        const view = getView();
        const above = view.attenuationAboveCap;
        if (above == null) return "";
        const sugar = Number(view.fieldsById?.[N.sugarExtract]?.value) || 0;
        const sta1 = view.selectedYeast?.sta1 === true;
        if (sta1 && sugar > 0) return "diastaticus + sugar";
        if (sta1) return "diastaticus";
        return "sugar";
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
          return "mash-limited";
        }
        return cap == null ? "" : "yeast cap";
      },
    },
  };
}
