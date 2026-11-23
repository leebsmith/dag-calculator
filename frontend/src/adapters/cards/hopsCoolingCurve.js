// Cooling-curve picker for the whirlpool settings block. The curve is an
// authored record; the card fits it and copies only the time constant into the
// batch. Ambient stays a brew-day input.

import { coolingCurveWarnings, fitCoolingCurve } from "../../views/coolingCurve.js";
import { HOP_NODES as N } from "../../views/registry/hops.js";
import { formatFieldLabel, formatWithDecimals, isFiniteNumber } from "../../utils.js";

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


function whirlpoolNumberField(app, options) {
  const current = () => options.field();
  return {
    id: options.id,
    type: "number",
    label: () => {
      const field = current();
      return field ? formatFieldLabel(field.label, field.unit) : "";
    },
    read: () => current()?.display,
    write: (value) =>
      options.write ? options.write(value) : current() && app.edit(current(), value),
    when: () => Boolean(current()),
    step: options.step,
    ...(options.min === undefined ? {} : { min: options.min }),
    commit: "change",
    hint: () => current()?.hint,
  };
}

function whirlpoolFieldActions() {
  return {
    // The whirlpool settings schema. Four number fields share one builder; the
    // cooling-curve picker carries its own option and action shape.
    whirlpoolFields() {
      const app = this;
      return [
        whirlpoolNumberField(app, {
          id: "whirlpool-knockout",
          field: () => app.whirlpoolKnockoutField,
          step: 1,
          min: 0,
        }),
        whirlpoolNumberField(app, {
          id: "whirlpool-start-temp",
          field: () => app.whirlpoolStartTempField,
          step: 0.1,
        }),
        whirlpoolNumberField(app, {
          id: "whirlpool-ambient",
          field: () => app.whirlpoolAmbientField,
          step: 0.1,
        }),
        whirlpoolNumberField(app, {
          id: "whirlpool-cooling-time-constant",
          field: () => app.whirlpoolCoolingField,
          step: 1,
          min: 1,
          write: (value) => app.editWhirlpoolCooling(value),
        }),
        {
          id: "whirlpool-cooling-curve",
          type: "select",
          label: "Cooling curve",
          read: () => app.coolingCurveValue,
          write: (value) => app.selectCoolingCurve(value),
          options: () => {
            const options = [{ value: "", label: "Default cooling" }];
            if (app.coolingCurveIsCustom) {
              options.push({
                value: app.customCoolingCurveValue,
                label: "Custom (manual time constant)",
              });
            }
            for (const curve of app.coolingCurveOptions) {
              options.push({ value: curve.id, label: curve.name });
            }
            if (app.coolingCurveMissing) {
              options.push({ value: app.coolingCurveId, label: "Missing curve — " + app.coolingCurveId });
            }
            return options;
          },
          actions: [{ label: "Manage library", run: () => app.openCoolingCurveLibrary() }],
          hint: () => app.coolingCurveSummary,
          hints: () => (app.coolingCurveWarnings || []).map((text) => ({ text, class: "text-warning" })),
        },
      ];
    },
  };
}

export function createCoolingCurvePicker(ctx, { formatTemp }) {
  const { engine, artifact, cache, getView } = ctx;
  const actions = {
    coolingCurveNotice: "",
    customCoolingCurveValue: CUSTOM_COOLING_CURVE,
    ...pickerActions(ctx),
    ...whirlpoolFieldActions(),
  };
  Object.defineProperties(actions, {
    ...stateDescriptors({ engine, artifact, cache, getView }),
    ...fitDescriptors({ engine, cache, formatTemp, getView }),
  });
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
  "whirlpoolFields",
];
