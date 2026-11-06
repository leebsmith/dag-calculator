// Hop card getters: mass readouts, draft summaries, start-band edits, the
// policy/timeline mirrors, and the field-model lookups.

import { HOP_NODES as N } from "../../views/registry/hops.js";
import { hopSectionMetaDescriptors } from "../../views/producer/hopSections.js";
import {
  HOP_MASS_KEY,
  boilPolicyDescriptors,
  catalogResultLabel,
  combinedMassDisplay,
  draftPartsTotal,
  draftSummary,
  massTotalDisplay,
  massTotalKg,
  whirlpoolPolicyDescriptors,
  whirlpoolTimelineDescriptors,
} from "../../views/hopsLogic.js";
import { formatWithDecimals } from "../../utils.js";
import { ignoreError } from "../../observability.js";

// The silent `reportError` default is for direct unit tests; the hop card's
// refresh and descriptors pass the app reporter.
export function resolveOrNull(engine, path, reportError = ignoreError) {
  try {
    return engine.resolve(path);
  } catch (err) {
    reportError("hops.resolve", err);
    return null;
  }
}

export function massDescriptors({ formatMass, getView }) {
  return {
    hopMassUnit: {
      configurable: true,
      get() {
        const view = getView();
        return view.unitMode?.[HOP_MASS_KEY] ?? view.unitMode?.mass ?? "g";
      },
    },
    boilHopTotalMassDisplay: {
      configurable: true,
      get() {
        const view = getView();
        return massTotalDisplay({
          rows: view.hopRows,
          boundaryMassKg: view.boilHopMassKg,
          unit: view.hopMassUnit,
          formatMass,
        });
      },
    },
    hopTotalMassKg: {
      configurable: true,
      get() {
        const view = getView();
        return massTotalKg(
          [...(view.hopRows ?? []), ...(view.whirlpoolHopRows ?? [])],
          view.hopBoundaryTotalMassKg
        );
      },
    },
    hopTotalMassDisplay: {
      configurable: true,
      get() {
        const view = getView();
        return combinedMassDisplay({
          boilRows: view.hopRows,
          whirlpoolRows: view.whirlpoolHopRows,
          boundaryMassKg: view.hopBoundaryTotalMassKg,
          unit: view.hopMassUnit,
          formatMass,
        });
      },
    },
    whirlpoolHopTotalMassDisplay: {
      configurable: true,
      get() {
        const view = getView();
        return massTotalDisplay({
          rows: view.whirlpoolHopRows,
          boundaryMassKg: view.whirlpoolHopMassKg,
          unit: view.hopMassUnit,
          formatMass,
        });
      },
    },
  };
}

export function draftDescriptors({ getView }) {
  return {
    hopDraftPartsTotal: {
      configurable: true,
      get() {
        return draftPartsTotal(getView().draftRows);
      },
    },
    hopDraftSummary: {
      configurable: true,
      get() {
        return draftSummary(getView().draftRows);
      },
    },
    whirlpoolHopDraftPartsTotal: {
      configurable: true,
      get() {
        return draftPartsTotal(getView().draftRows);
      },
    },
    whirlpoolHopDraftSummary: {
      configurable: true,
      get() {
        return draftSummary(getView().draftRows);
      },
    },
    hopResultLabel: {
      configurable: true,
      get() {
        const view = getView();
        return catalogResultLabel({
          visible: view.hopVisibleCatalog.length,
          filtered: view.hopFilteredCatalog.length,
          truncated: view.hopCatalogTruncated,
        });
      },
    },
    whirlpoolHopResultLabel: {
      configurable: true,
      get() {
        const view = getView();
        return catalogResultLabel({
          visible: view.whirlpoolHopVisibleCatalog.length,
          filtered: view.whirlpoolHopFilteredCatalog.length,
          truncated: view.whirlpoolHopCatalogTruncated,
        });
      },
    },
  };
}

export function whirlpoolStartDescriptors({ getView }) {
  return {
    setWhirlpoolStartBand: {
      configurable: true,
      writable: true,
      value(bandId) {
        const view = getView();
        const band = view.whirlpoolStartBands.find((candidate) => candidate.value === bandId);
        if (!band || view.whirlpoolHopActiveIndex == null) return;
        view.patchDraftRow(view.whirlpoolHopActiveIndex, { initial_temp_c: band.mid });
      },
    },
  };
}

export function policyDescriptors({ cache, engine, formatTemp, formatMass, getView, reportError }) {
  return {
    ...whirlpoolPolicyDescriptors({
      notes: cache?.seeds?.whirlpoolNotes ?? {},
      formatTemp,
      formatMass,
      formatNumber: formatWithDecimals,
      postBoilVolume: () => resolveOrNull(engine, N.postBoilVolume, reportError),
      whirlpoolIbu: () => Number(resolveOrNull(engine, N.whirlpoolIbu, reportError)),
      activeRow: () => getView().whirlpoolHopActiveRow,
      alphaMassKg: () => getView().whirlpoolHopAlphaMassKg,
    }),
    ...boilPolicyDescriptors({
      formatMass,
      formatNumber: formatWithDecimals,
      postBoilVolume: () => resolveOrNull(engine, N.postBoilVolume, reportError),
      boilIbu: () => Number(resolveOrNull(engine, N.boilIbu, reportError)),
      rows: () => getView().hopRows,
      alphaMassKg: () => getView().boilHopAlphaMassKg,
    }),
    ...whirlpoolTimelineDescriptors({
      formatTemp,
      formatNumber: formatWithDecimals,
      readTimeline: () => ({
        segments: resolveOrNull(engine, N.whirlpoolTimeline, reportError) ?? null,
        chills: resolveOrNull(engine, N.whirlpoolChills, reportError) ?? [],
      }),
      reportError,
      timelineState: () => getView().whirlpoolTimelineState,
      rows: () => getView().whirlpoolHopRows,
    }),
    ...hopSectionMetaDescriptors(getView),
  };
}

export function fieldDescriptors(getView) {
  const out = {};
  for (const [key, id] of Object.entries({
    boilIbuField: N.boilIbu,
    whirlpoolIbuField: N.whirlpoolIbu,
    totalIbuField: N.totalIbu,
    whirlpoolAmbientField: N.whirlpoolAmbient,
    whirlpoolCoolingField: N.whirlpoolCoolingTimeConstant,
    whirlpoolKnockoutField: N.whirlpoolKnockout,
    whirlpoolStartTempField: N.whirlpoolStartTemp,
  })) {
    out[key] = {
      configurable: true,
      get() {
        return (getView().fieldsBySlice[N.slice] ?? []).find((field) => field.id === id) ?? null;
      },
    };
  }
  return out;
}
