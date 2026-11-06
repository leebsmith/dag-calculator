// Style card / targets: the scale pin (OG/FG/ABV) and the style-envelope
// bounded SRM/IBU sliders with their planned bitterness readouts. The pin is
// the one target root the navigator plots, so both modules read it.

import { STYLE_NODES as N } from "../../../views/registry/style.js";
import {
  SCALE_PINS,
  formatIbu,
  formatIbuGu,
  ibuDrift,
  ibuSliderBounds,
  plannedIbuGu,
  scalePinState,
  scaleTargetMismatch,
  srmDeltaScale,
  srmDisplay,
  srmDrift,
  srmHint,
  srmSliderBounds,
  styleBounds,
  whirlpoolPercent,
} from "../../../views/styleTargetsLogic.js";
import { nonlinearFns } from "../../../views/producer.js";
import { provenanceFor, roundTo } from "../../../utils.js";

export function registerStyleTargets(app, ctx) {
  const { engine, artifact } = ctx;
  const nl = nonlinearFns(artifact, engine);

  Object.assign(app, {
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

    syncScalePinState() {
      const pin = engine.get(N.scalePin) ?? "abv";
      const root =
        pin === "og" ? N.targetOg : pin === "fg" ? N.targetFg : N.targetAbv;
      Object.assign(
        this,
        scalePinState({
          pin,
          root,
          value: engine.get(root),
          gravity: this.styleGravityDisplay,
        })
      );
      this.updateStylePreview();
    },

    setScalePin(value) {
      if (!SCALE_PINS.some((pin) => pin.value === value)) return;
      if (value === this.scalePin) return;
      this.setRoot(N.scalePin, value);
      this.clearInputDraft(this.inputKey("field", "scale-target"));
      this.syncScalePinState();
      this.syncScalePreviewState?.();
      this.scheduleSolve();
      this.notify();
    },

    setScaleTarget(value) {
      const numeric = Number(value);
      if (!Number.isFinite(numeric) || numeric <= 0) return;
      // The input speaks the display unit; the root is always SG.
      const target =
        this.scalePin === "abv"
          ? roundTo(numeric, 1)
          : this.styleGravityDisplay.toSg(numeric);
      this.setRoot(this.activeScaleTargetRoot, target);
      this.styleAbvTouched = this.scalePin === "abv" ? true : this.styleAbvTouched;
      this.syncScalePinState();
      this.scheduleSolve();
      this.notify();
    },

    editScaleTargetInput(raw) {
      const key = this.inputKey("field", "scale-target");
      this.setInputDraft(key, raw);
      this.setScaleTarget(raw);
    },

    commitScaleTargetInput(raw) {
      this.clearInputDraft(this.inputKey("field", "scale-target"));
      this.setScaleTarget(raw);
    },

    resetScaleTarget() {
      this.unsetRoot(this.activeScaleTargetRoot);
      this.syncScalePinState();
      this.scheduleSolve();
      this.notify();
    },

    refreshTargets() {
      this.targetSrm = engine.get(N.targets.srm);
      this.targetIbu = engine.get(N.targets.ibu);
      this.whirlpoolFraction = engine.get(N.targets.whirlpoolFraction);
      this.boilIbu = engine.get(N.targets.boilIbu);
      this.whirlpoolIbu = engine.get(N.targets.whirlpoolIbu);
    },

    setTargetSrm(value) {
      const n = Number(value);
      if (!Number.isFinite(n)) return;
      this.setRoot(N.targets.srm, Math.max(0, n));
      this.refreshTargets();
      this.scheduleSolve();
      this.notify();
    },

    setTargetIbu(value) {
      const n = Number(value);
      if (!Number.isFinite(n)) return;
      this.setRoot(N.targets.ibu, Math.max(0, n));
      this.refreshTargets();
      this.scheduleSolve();
      this.notify();
    },

    setWhirlpoolFraction(value) {
      const n = Number(value);
      if (!Number.isFinite(n)) return;
      this.setRoot(N.targets.whirlpoolFraction, Math.max(0, Math.min(1, n)));
      this.refreshTargets();
      this.scheduleSolve();
      this.notify();
    },
  });

  Object.defineProperties(app, {
    scalePinOptions: {
      configurable: true,
      get() {
        return SCALE_PINS;
      },
    },
    styleSrmBounds: {
      configurable: true,
      get() {
        return styleBounds(this.fieldsById, N.envelope.srmMin, N.envelope.srmMax);
      },
    },
    styleIbuBounds: {
      configurable: true,
      get() {
        return styleBounds(this.fieldsById, N.envelope.ibuMin, N.envelope.ibuMax);
      },
    },
    // The sliders reach two just-noticeable differences past the envelope; the
    // envelope getters above stay the style's absolute bounds (scoring reads them).
    styleSrmSliderBounds: {
      configurable: true,
      get() {
        return srmSliderBounds(this.styleSrmBounds);
      },
    },
    styleIbuSliderBounds: {
      configurable: true,
      get() {
        return ibuSliderBounds(this.styleIbuBounds);
      },
    },
    // The slider's numbers follow the target field's display unit (the same
    // master/override resolution the input uses); the stored target stays SRM.
    styleSrmHint: {
      configurable: true,
      get() {
        return srmHint({
          field: this.srmTargetField,
          bounds: this.styleSrmBounds,
          artifact,
          nl,
        });
      },
    },
    srmTargetDisplay: {
      configurable: true,
      get() {
        return srmDisplay({
          field: this.srmTargetField,
          target: this.targetSrm,
          artifact,
          nl,
        });
      },
    },
    srmTargetOutside: {
      configurable: true,
      get() {
        if (!this.srmTargetField) return false;
        return srmDrift({
          target: this.targetSrm,
          bounds: this.styleSrmBounds,
          field: this.srmTargetField,
          toDisplay: this.srmTargetDelta,
        }).outside;
      },
    },
    srmTargetNote: {
      configurable: true,
      get() {
        const field = this.srmTargetField;
        if (!field) return "";
        return srmDrift({
          target: this.targetSrm,
          bounds: this.styleSrmBounds,
          field,
          toDisplay: this.srmTargetDelta,
        }).text;
      },
    },
    // A colour deviation converts like a value because every colour unit is
    // linear; the exact factor comes from the artifact, not from a constant.
    srmTargetDelta: {
      configurable: true,
      get() {
        return srmDeltaScale({ field: this.srmTargetField, artifact, nl });
      },
    },
    ibuTargetOutside: {
      configurable: true,
      get() {
        return ibuDrift({ target: this.targetIbu, bounds: this.styleIbuBounds }).outside;
      },
    },
    ibuTargetNote: {
      configurable: true,
      get() {
        return ibuDrift({ target: this.targetIbu, bounds: this.styleIbuBounds }).text;
      },
    },
    // The SRM/IBU target roots live on the batch slice, but the style card shows
    // them as sliders; expose their field models (with `seeded`/`seededValue`)
    // for the seed provenance affordance.
    srmTargetField: {
      configurable: true,
      get() {
        return this.fieldsById?.[N.targets.srm] ?? null;
      },
    },
    ibuTargetField: {
      configurable: true,
      get() {
        return this.fieldsById?.[N.targets.ibu] ?? null;
      },
    },
    srmTargetProvenance: {
      configurable: true,
      get() {
        return provenanceFor(this.srmTargetField);
      },
    },
    ibuTargetProvenance: {
      configurable: true,
      get() {
        return provenanceFor(this.ibuTargetField);
      },
    },
    // Planned bitterness balance: planned IBU over the planned OG's gravity
    // units (from the fermentation-target navigator), so it needs no solve.
    ibuGu: {
      configurable: true,
      get() {
        return plannedIbuGu(this.targetIbu, this.styleTargetInfo?.og);
      },
    },
    ibuGuDisplay: {
      configurable: true,
      get() {
        return formatIbuGu(this.ibuGu);
      },
    },
    whirlpoolPctDisplay: {
      configurable: true,
      get() {
        return whirlpoolPercent(this.whirlpoolFraction);
      },
    },
    boilIbuDisplay: {
      configurable: true,
      get() {
        return formatIbu(this.boilIbu);
      },
    },
    whirlpoolIbuDisplay: {
      configurable: true,
      get() {
        return formatIbu(this.whirlpoolIbu);
      },
    },
  });
}

export function refreshStyleTargets(app) {
  app.syncScalePinState();
  app.refreshTargets();
  app.scaleTargetMismatch = scaleTargetMismatch({
    pin: app.scalePin,
    target: app.activeScaleTarget,
    info: app.styleTargetInfo,
    status: app.boundaryStatuses?.[N.solverBatch] ?? "unknown",
    gravity: app.styleGravityDisplay,
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
