// Mash card getters: preset labels, timing, thickness, and the modal draft.
// Each getter resolves the live view through the injected getView.

import * as mash from "../../views/mash.js";
import { displayValue, nonlinearFns } from "../../views/producer.js";
import {
  canonicalRestRows,
  isLgrBelowFloor,
  lgrSummary,
  mashTimeLabel,
  mashTimeSummaryLabel,
  restMinutes,
  temperatureLabel,
  thicknessLabel,
} from "../../views/producer/mashRows.js";
import { UNIT_SYMBOLS } from "../../views/registry/units.js";
import { unitSymbol } from "../../utils.js";

export function presetDescriptors({ getView }) {
  return {
    mashPresetIdState: { configurable: true, writable: true, value: null },
    mashPresetLabels: {
      configurable: true,
      get() {
        return mash.MASH_PRESET_LABELS;
      },
    },
    mashPresetId: {
      configurable: true,
      get() {
        return getView().mashPresetIdState ?? "custom";
      },
    },
    canonicalMashRests: {
      configurable: true,
      get() {
        return canonicalRestRows(getView().mashRests);
      },
    },
    sortedMashRests: {
      configurable: true,
      get() {
        return mash.sortRestsByTemperature(getView().mashRests);
      },
    },
    enabledMashRests: {
      configurable: true,
      get() {
        return getView().sortedMashRests.filter((r) => r.enabled);
      },
    },
    doughInInheritedTempC: {
      configurable: true,
      get() {
        return getView().mashDoughInTempC;
      },
    },
  };
}

export function timeDescriptors({ getView }) {
  return {
    temperatureUnit: {
      configurable: true,
      get() {
        const unitId = getView().unitMode?.temperature ?? "degC";
        return unitSymbol(UNIT_SYMBOLS, "temperature", unitId);
      },
    },
    doughInDisplay: {
      configurable: true,
      get() {
        const view = getView();
        const v = view.doughInInheritedTempC;
        if (v == null) return "";
        return temperatureLabel(view._convert("temperature", v, "degC"));
      },
    },
    totalMashTimeMin: {
      configurable: true,
      get() {
        return getView().mashTotalTimeMin;
      },
    },
    totalMashTimeDisplay: {
      configurable: true,
      get() {
        return mashTimeLabel(getView().totalMashTimeMin);
      },
    },
    rampTimeMin: {
      configurable: true,
      get() {
        return getView().mashRampTimeMin;
      },
    },
    restTimeMin: {
      configurable: true,
      get() {
        const view = getView();
        return restMinutes(view.mashTotalTimeMin, view.mashRampTimeMin);
      },
    },
  };
}

export function thicknessDescriptors({ artifact, engine, getView }) {
  const shownThickness = (value) =>
    thicknessLabel(
      displayValue(
        artifact,
        "mash_thickness",
        getView().mashThicknessUnitId,
        value,
        nonlinearFns(artifact, engine)
      )
    );
  return {
    mashThicknessUnitId: {
      configurable: true,
      get() {
        return getView().unitMode?.mash_thickness ?? "L_per_kg";
      },
    },
    mashThicknessUnit: {
      configurable: true,
      get() {
        return unitSymbol(UNIT_SYMBOLS, "mash_thickness", getView().mashThicknessUnitId);
      },
    },
    mashThicknessDisplay: {
      configurable: true,
      get() {
        const v = getView().mashThicknessLPerKg;
        if (!Number.isFinite(v)) return "";
        return shownThickness(v);
      },
    },
    minLgrDisplay: {
      configurable: true,
      get() {
        const v = getView().minLgrLPerKg;
        if (!Number.isFinite(v)) return "";
        return shownThickness(v);
      },
    },
    mashLgrBelowFloor: {
      configurable: true,
      get() {
        const view = getView();
        return isLgrBelowFloor(view.mashThicknessLPerKg, view.minLgrLPerKg);
      },
    },
    mashLgrSummary: {
      configurable: true,
      get() {
        const view = getView();
        return lgrSummary(view.mashThicknessDisplay, view.mashThicknessUnit, view.minLgrDisplay);
      },
    },
    mashTimeSummary: {
      configurable: true,
      get() {
        const view = getView();
        return mashTimeSummaryLabel(view.rampTimeMin, view.restTimeMin);
      },
    },
  };
}

export function draftDescriptors({ getView }) {
  return {
    sortedMashDraftRests: {
      configurable: true,
      get() {
        return mash.sortRestsByTemperature(getView().mashDraft).filter((r) => r.enabled);
      },
    },
    isMashDraftValid: {
      configurable: true,
      get() {
        return mash.isMashScheduleValid(getView().sortedMashDraftRests);
      },
    },
  };
}
