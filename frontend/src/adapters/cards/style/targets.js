// Style card / targets: the scale pin (OG/FG/ABV) and the style-envelope
// bounded SRM/IBU sliders with their planned bitterness readouts. The pin is
// the one target root the navigator plots, so both modules read it.

import { STYLE_NODES as N } from "../../../views/registry/style.js";
import {
  SCALE_PINS,
  ibuSliderBounds,
  scalePinState,
  scaleTargetMismatch,
  srmDeltaScale,
  srmDisplay,
  srmDrift,
  srmHint,
  srmSliderBounds,
  styleBounds,
} from "../../../views/styleTargetsLogic.js";
import { nonlinearFns } from "../../../views/producer.js";
import { provenanceFor, roundTo } from "../../../utils.js";
import { ibuDescriptors } from "./styleTargetGetters.js";

function pinActions({ engine, getView }) {
  return {
    syncScalePinState() {
      const view = getView();
      const pin = engine.get(N.scalePin) ?? "abv";
      const root = pin === "og" ? N.targetOg : pin === "fg" ? N.targetFg : N.targetAbv;
      Object.assign(
        view,
        scalePinState({
          pin,
          root,
          value: engine.get(root),
          gravity: view.styleGravityDisplay,
        })
      );
      view.updateStylePreview();
    },

    setScalePin(value) {
      if (!SCALE_PINS.some((pin) => pin.value === value)) return;
      const view = getView();
      if (value === view.scalePin) return;
      view.setRoot(N.scalePin, value);
      view.clearInputDraft(view.inputKey("field", "scale-target"));
      view.syncScalePinState();
      view.syncScalePreviewState?.();
      view.scheduleSolve();
      view.notify();
    },

    setScaleTarget(value) {
      const view = getView();
      const numeric = Number(value);
      if (!Number.isFinite(numeric) || numeric <= 0) return;
      // The input speaks the display unit; the root is always SG.
      const target =
        view.scalePin === "abv" ? roundTo(numeric, 1) : view.styleGravityDisplay.toSg(numeric);
      view.setRoot(view.activeScaleTargetRoot, target);
      view.styleAbvTouched = view.scalePin === "abv" ? true : view.styleAbvTouched;
      view.syncScalePinState();
      view.scheduleSolve();
      view.notify();
    },

    editScaleTargetInput(raw) {
      const view = getView();
      const key = view.inputKey("field", "scale-target");
      view.setInputDraft(key, raw);
      view.setScaleTarget(raw);
    },

    commitScaleTargetInput(raw) {
      const view = getView();
      view.clearInputDraft(view.inputKey("field", "scale-target"));
      view.setScaleTarget(raw);
    },

    resetScaleTarget() {
      const view = getView();
      view.unsetRoot(view.activeScaleTargetRoot);
      view.syncScalePinState();
      view.scheduleSolve();
      view.notify();
    },
  };
}

function targetActions({ engine, getView }) {
  return {
    refreshTargets() {
      const view = getView();
      view.targetSrm = engine.get(N.targets.srm);
      view.targetIbu = engine.get(N.targets.ibu);
      view.whirlpoolFraction = engine.get(N.targets.whirlpoolFraction);
      view.boilIbu = engine.get(N.targets.boilIbu);
      view.whirlpoolIbu = engine.get(N.targets.whirlpoolIbu);
    },

    setTargetSrm(value) {
      const view = getView();
      const n = Number(value);
      if (!Number.isFinite(n)) return;
      view.setRoot(N.targets.srm, Math.max(0, n));
      view.refreshTargets();
      view.scheduleSolve();
      view.notify();
    },

    setTargetIbu(value) {
      const view = getView();
      const n = Number(value);
      if (!Number.isFinite(n)) return;
      view.setRoot(N.targets.ibu, Math.max(0, n));
      view.refreshTargets();
      view.scheduleSolve();
      view.notify();
    },

    setWhirlpoolFraction(value) {
      const view = getView();
      const n = Number(value);
      if (!Number.isFinite(n)) return;
      view.setRoot(N.targets.whirlpoolFraction, Math.max(0, Math.min(1, n)));
      view.refreshTargets();
      view.scheduleSolve();
      view.notify();
    },
  };
}

function boundsDescriptors({ artifact, nl, getView }) {
  return {
    scalePinOptions: {
      configurable: true,
      get() {
        return SCALE_PINS;
      },
    },
    styleSrmBounds: {
      configurable: true,
      get() {
        return styleBounds(getView().fieldsById, N.envelope.srmMin, N.envelope.srmMax);
      },
    },
    styleIbuBounds: {
      configurable: true,
      get() {
        return styleBounds(getView().fieldsById, N.envelope.ibuMin, N.envelope.ibuMax);
      },
    },
    // The sliders reach two just-noticeable differences past the envelope; the
    // envelope getters above stay the style's absolute bounds (scoring reads them).
    styleSrmSliderBounds: {
      configurable: true,
      get() {
        return srmSliderBounds(getView().styleSrmBounds);
      },
    },
    styleIbuSliderBounds: {
      configurable: true,
      get() {
        return ibuSliderBounds(getView().styleIbuBounds);
      },
    },
    // The slider's numbers follow the target field's display unit (the same
    // master/override resolution the input uses); the stored target stays SRM.
    styleSrmHint: {
      configurable: true,
      get() {
        const view = getView();
        return srmHint({ field: view.srmTargetField, bounds: view.styleSrmBounds, artifact, nl });
      },
    },
  };
}

function srmDescriptors({ artifact, nl, getView }) {
  return {
    srmTargetDisplay: {
      configurable: true,
      get() {
        const view = getView();
        return srmDisplay({ field: view.srmTargetField, target: view.targetSrm, artifact, nl });
      },
    },
    srmTargetOutside: {
      configurable: true,
      get() {
        const view = getView();
        if (!view.srmTargetField) return false;
        return srmDrift({
          target: view.targetSrm,
          bounds: view.styleSrmBounds,
          field: view.srmTargetField,
          toDisplay: view.srmTargetDelta,
        }).outside;
      },
    },
    srmTargetNote: {
      configurable: true,
      get() {
        const view = getView();
        const field = view.srmTargetField;
        if (!field) return "";
        return srmDrift({
          target: view.targetSrm,
          bounds: view.styleSrmBounds,
          field,
          toDisplay: view.srmTargetDelta,
        }).text;
      },
    },
    // A colour deviation converts like a value because every colour unit is
    // linear; the exact factor comes from the artifact, not from a constant.
    srmTargetDelta: {
      configurable: true,
      get() {
        return srmDeltaScale({ field: getView().srmTargetField, artifact, nl });
      },
    },
    // The SRM/IBU target roots live on the batch slice, but the style card shows
    // them as sliders; expose their field models (with `seeded`/`seededValue`)
    // for the seed provenance affordance.
    srmTargetField: {
      configurable: true,
      get() {
        return getView().fieldsById?.[N.targets.srm] ?? null;
      },
    },
    srmTargetProvenance: {
      configurable: true,
      get() {
        return provenanceFor(getView().srmTargetField);
      },
    },
  };
}

export function createStyleTargets(ctx) {
  const { artifact, engine } = ctx;
  const nl = nonlinearFns(artifact, engine);
  const actions = {
    // Reactive mirrors of the active pin/target. Alpine only re-renders on
    // property assignments; getters over the non-reactive engine go stale.
    scalePin: "abv",
    scalePinLabel: "ABV",
    activeScaleTargetRoot: N.targetAbv,
    activeScaleTarget: null,
    activeScaleTargetLabel: "Target ABV",
    activeScaleTargetDisplay: "",
    activeScaleTargetUnit: "%",
    activeScaleTargetStep: "0.1",
    scaleTargetMismatch: "",

    // Reactive mirrors of the target roots (refreshed in refreshStyleTargets).
    targetSrm: 0,
    targetIbu: 30,
    whirlpoolFraction: 0,
    boilIbu: 30,
    whirlpoolIbu: 0,
    ...pinActions(ctx),
    ...targetActions(ctx),
  };
  Object.defineProperties(actions, {
    ...boundsDescriptors({ artifact, nl, ...ctx }),
    ...srmDescriptors({ artifact, nl, ...ctx }),
    ...ibuDescriptors(ctx),
  });
  return actions;
}

export function refreshStyleTargets(app, ctx = {}) {
  app.syncScalePinState();
  app.refreshTargets();
  app.scaleTargetMismatch = scaleTargetMismatch({
    pin: app.scalePin,
    target: app.activeScaleTarget,
    info: ctx.styleTargetInfo,
    status: ctx.boundaryStatuses?.[N.solverBatch] ?? "unknown",
    gravity: ctx.styleGravityDisplay,
  });
}

export const KEYS = [
  "scalePin",
  "scalePinLabel",
  "activeScaleTargetRoot",
  "activeScaleTarget",
  "activeScaleTargetLabel",
  "activeScaleTargetDisplay",
  "activeScaleTargetUnit",
  "activeScaleTargetStep",
  "scaleTargetMismatch",
  "targetSrm",
  "targetIbu",
  "whirlpoolFraction",
  "boilIbu",
  "whirlpoolIbu",
  "syncScalePinState",
  "setScalePin",
  "setScaleTarget",
  "editScaleTargetInput",
  "commitScaleTargetInput",
  "resetScaleTarget",
  "refreshTargets",
  "setTargetSrm",
  "setTargetIbu",
  "setWhirlpoolFraction",
  "scalePinOptions",
  "styleSrmBounds",
  "styleIbuBounds",
  "styleSrmSliderBounds",
  "styleIbuSliderBounds",
  "styleSrmHint",
  "srmTargetDisplay",
  "srmTargetOutside",
  "srmTargetNote",
  "srmTargetDelta",
  "ibuTargetOutside",
  "ibuTargetNote",
  "srmTargetField",
  "ibuTargetField",
  "srmTargetProvenance",
  "ibuTargetProvenance",
  "ibuGu",
  "ibuGuDisplay",
  "whirlpoolPctDisplay",
  "boilIbuDisplay",
  "whirlpoolIbuDisplay",
];
