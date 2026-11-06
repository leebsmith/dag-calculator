// Cooling-curve picker for the whirlpool settings block. The curve is an
// authored record; the card fits it and copies only the time constant into the
// batch. Ambient stays a brew-day input.

import { coolingCurveWarnings, fitCoolingCurve } from "../../views/coolingCurve.js";
import { HOP_NODES as N } from "../../views/registry/hops.js";
import { formatWithDecimals, isFiniteNumber } from "../../utils.js";

export const CUSTOM_COOLING_CURVE = "__custom__";

function fitOf(record) {
  if (!record) return null;
  return fitCoolingCurve({
    startTempC: record.start_temp_c,
    ambientTempC: record.ambient_temp_c,
    points: record.points,
  });
}

function defaultTimeConstant(artifact) {
  const value = artifact.nodes?.[N.whirlpoolCoolingTimeConstant]?.default;
  return isFiniteNumber(value) ? value : 108.7;
}

function curveAt(cache, id) {
  return id ? cache.seeds.coolingCurves?.[id] ?? null : null;
}

function pickerActions({ artifact, cache, getView }) {
  return {
    selectCoolingCurve(id) {
      const view = getView();
      view.coolingCurveNotice = "";
      if (id === CUSTOM_COOLING_CURVE) return;
      if (!id) {
        view.setRoot(N.whirlpoolCoolingTimeConstant, defaultTimeConstant(artifact));
        view.setRoot(N.coolingCurveId, "");
        view.scheduleSolve();
        view.notify();
        return;
      }
      const record = curveAt(cache, id);
      if (!record) {
        view.coolingCurveNotice = "That curve is no longer in the library.";
        view.notify();
        return;
      }
      const fit = fitOf(record);
      if (!fit?.valid) {
        view.coolingCurveNotice = fit?.reason ?? "The curve could not be fitted.";
        view.notify();
        return;
      }
      view.setRoot(N.whirlpoolCoolingTimeConstant, fit.tauMin);
      view.setRoot(N.coolingCurveId, id);
      view.scheduleSolve();
      view.notify();
    },

    editWhirlpoolCooling(value) {
      const view = getView();
      view.setRoot(N.coolingCurveId, "");
      view.coolingCurveNotice = "";
      view.edit(view.whirlpoolCoolingField, value);
    },

    openCoolingCurveLibrary() {
      getView().openLibrary("cooling_curve");
    },
  };
}

function stateDescriptors({ engine, artifact, cache, getView }) {
  const batchTimeConstant = () => {
    const value = engine.get(N.whirlpoolCoolingTimeConstant);
    return isFiniteNumber(value) ? value : null;
  };
  return {
    coolingCurveId: {
      configurable: true,
      get() {
        const view = getView();
        void view.libraryRevision;
        return engine.get(N.coolingCurveId) || "";
      },
    },
    coolingCurveOptions: {
      configurable: true,
      get() {
        void getView().libraryRevision;
        return Object.values(cache.seeds.coolingCurves ?? {}).sort((left, right) =>
          String(left.name ?? left.id).localeCompare(String(right.name ?? right.id))
        );
      },
    },
    coolingCurveRecord: {
      configurable: true,
      get() {
        return curveAt(cache, getView().coolingCurveId);
      },
    },
    coolingCurveMissing: {
      configurable: true,
      get() {
        const view = getView();
        return Boolean(view.coolingCurveId) && !view.coolingCurveRecord;
      },
    },
    coolingCurveFit: {
      configurable: true,
      get() {
        return fitOf(getView().coolingCurveRecord);
      },
    },
    coolingCurveIsCustom: {
      configurable: true,
      get() {
        const tau = batchTimeConstant();
        const id = getView().coolingCurveId;
        return !id && tau !== null && Math.abs(tau - defaultTimeConstant(artifact)) > 1e-9;
      },
    },
    coolingCurveValue: {
      configurable: true,
      get() {
        const view = getView();
        if (view.coolingCurveId) return view.coolingCurveId;
        return view.coolingCurveIsCustom ? CUSTOM_COOLING_CURVE : "";
      },
    },
    coolingCurveStatus: {
      configurable: true,
      get() {
        const view = getView();
        if (view.coolingCurveMissing) return "Missing curve";
        if (view.coolingCurveIsCustom) return "Custom";
        if (!view.coolingCurveId) return "Default cooling";
        return view.coolingCurveRecord?.name ?? "Default cooling";
      },
    },
  };
}

function fitDescriptors({ engine, cache, formatTemp, getView }) {
  const batchAmbient = () => {
    const value = engine.get(N.whirlpoolAmbient);
    return isFiniteNumber(value) ? value : null;
  };
  return {
    coolingCurveSummary: {
      configurable: true,
      get() {
        const fit = getView().coolingCurveFit;
        if (!fit?.valid) return "";
        return [
          `k ${formatWithDecimals(fit.kPerMin, 4)}/min`,
          `τ ${formatWithDecimals(fit.tauMin, 1)} min`,
          `R² ${formatWithDecimals(fit.r2, 3)}`,
        ].join(" · ");
      },
    },
    coolingCurveWarnings: {
      configurable: true,
      get() {
        const view = getView();
        const warnings = [];
        if (view.coolingCurveNotice) warnings.push(view.coolingCurveNotice);
        if (!view.coolingCurveId) return warnings;
        const record = curveAt(cache, view.coolingCurveId);
        if (!record) {
          warnings.push(
            `Missing curve "${view.coolingCurveId}". ` + "The batch keeps the copied time constant."
          );
          return warnings;
        }
        warnings.push(
          ...coolingCurveWarnings({
            fit: view.coolingCurveFit,
            curveAmbientC: record.ambient_temp_c,
            batchAmbientC: batchAmbient(),
            formatTemp,
          })
        );
        return warnings;
      },
    },
  };
}

export function createCoolingCurvePicker(ctx, { formatTemp }) {
  const { engine, artifact, cache, getView } = ctx;
  const actions = {
    coolingCurveNotice: "",
    customCoolingCurveValue: CUSTOM_COOLING_CURVE,
    ...pickerActions(ctx),
  };
  Object.defineProperties(actions, {
    ...stateDescriptors({ engine, artifact, cache, getView }),
    ...fitDescriptors({ engine, cache, formatTemp, getView }),
  });
  return actions;
}

export function installCoolingCurvePicker(app, ctx, { formatTemp }) {
  const actions = createCoolingCurvePicker(
    { ...ctx, getView: ctx.getView ?? (() => app) },
    { formatTemp }
  );
  Object.defineProperties(app, Object.getOwnPropertyDescriptors(actions));
  return actions;
}

export const KEYS = [
  "coolingCurveNotice",
  "customCoolingCurveValue",
  "selectCoolingCurve",
  "editWhirlpoolCooling",
  "openCoolingCurveLibrary",
  "coolingCurveId",
  "coolingCurveOptions",
  "coolingCurveRecord",
  "coolingCurveMissing",
  "coolingCurveFit",
  "coolingCurveIsCustom",
  "coolingCurveValue",
  "coolingCurveStatus",
  "coolingCurveSummary",
  "coolingCurveWarnings",
];
