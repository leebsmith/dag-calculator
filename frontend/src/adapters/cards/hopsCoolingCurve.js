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

function pickerActions({ artifact, cache }) {
  return {
    selectCoolingCurve(id) {
      this.coolingCurveNotice = "";
      if (id === CUSTOM_COOLING_CURVE) return;
      if (!id) {
        this.setRoot(N.whirlpoolCoolingTimeConstant, defaultTimeConstant(artifact));
        this.setRoot(N.coolingCurveId, "");
        this.scheduleSolve();
        this.notify();
        return;
      }
      const record = curveAt(cache, id);
      if (!record) {
        this.coolingCurveNotice = "That curve is no longer in the library.";
        this.notify();
        return;
      }
      const fit = fitOf(record);
      if (!fit?.valid) {
        this.coolingCurveNotice = fit?.reason ?? "The curve could not be fitted.";
        this.notify();
        return;
      }
      this.setRoot(N.whirlpoolCoolingTimeConstant, fit.tauMin);
      this.setRoot(N.coolingCurveId, id);
      this.scheduleSolve();
      this.notify();
    },

    editWhirlpoolCooling(value) {
      this.setRoot(N.coolingCurveId, "");
      this.coolingCurveNotice = "";
      this.edit(this.whirlpoolCoolingField, value);
    },

    openCoolingCurveLibrary() {
      this.openLibrary("cooling_curve");
    },
  };
}

function stateDescriptors({ engine, artifact, cache }) {
  const batchTimeConstant = () => {
    const value = engine.get(N.whirlpoolCoolingTimeConstant);
    return isFiniteNumber(value) ? value : null;
  };
  return {
    coolingCurveId: {
      configurable: true,
      get() {
        void this.libraryRevision;
        return engine.get(N.coolingCurveId) || "";
      },
    },
    coolingCurveOptions: {
      configurable: true,
      get() {
        void this.libraryRevision;
        return Object.values(cache.seeds.coolingCurves ?? {}).sort((left, right) =>
          String(left.name ?? left.id).localeCompare(String(right.name ?? right.id))
        );
      },
    },
    coolingCurveRecord: {
      configurable: true,
      get() {
        return curveAt(cache, this.coolingCurveId);
      },
    },
    coolingCurveMissing: {
      configurable: true,
      get() {
        return Boolean(this.coolingCurveId) && !this.coolingCurveRecord;
      },
    },
    coolingCurveFit: {
      configurable: true,
      get() {
        return fitOf(this.coolingCurveRecord);
      },
    },
    coolingCurveIsCustom: {
      configurable: true,
      get() {
        const tau = batchTimeConstant();
        return (
          !this.coolingCurveId && tau !== null && Math.abs(tau - defaultTimeConstant(artifact)) > 1e-9
        );
      },
    },
    coolingCurveValue: {
      configurable: true,
      get() {
        if (this.coolingCurveId) return this.coolingCurveId;
        return this.coolingCurveIsCustom ? CUSTOM_COOLING_CURVE : "";
      },
    },
    coolingCurveStatus: {
      configurable: true,
      get() {
        if (this.coolingCurveMissing) return "Missing curve";
        if (this.coolingCurveIsCustom) return "Custom";
        if (!this.coolingCurveId) return "Default cooling";
        return this.coolingCurveRecord?.name ?? "Default cooling";
      },
    },
  };
}

function fitDescriptors({ engine, cache, formatTemp }) {
  const batchAmbient = () => {
    const value = engine.get(N.whirlpoolAmbient);
    return isFiniteNumber(value) ? value : null;
  };
  return {
    coolingCurveSummary: {
      configurable: true,
      get() {
        const fit = this.coolingCurveFit;
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
        const warnings = [];
        if (this.coolingCurveNotice) warnings.push(this.coolingCurveNotice);
        if (!this.coolingCurveId) return warnings;
        const record = curveAt(cache, this.coolingCurveId);
        if (!record) {
          warnings.push(
            `Missing curve "${this.coolingCurveId}". ` +
              "The batch keeps the copied time constant."
          );
          return warnings;
        }
        warnings.push(
          ...coolingCurveWarnings({
            fit: this.coolingCurveFit,
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

export function installCoolingCurvePicker(app, ctx, { formatTemp }) {
  const { engine, artifact, cache } = ctx;
  Object.assign(app, {
    coolingCurveNotice: "",
    customCoolingCurveValue: CUSTOM_COOLING_CURVE,
    ...pickerActions(ctx),
  });
  Object.defineProperties(app, {
    ...stateDescriptors({ engine, artifact, cache }),
    ...fitDescriptors({ engine, cache, formatTemp }),
  });
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
