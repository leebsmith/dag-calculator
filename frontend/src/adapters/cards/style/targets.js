// Style card / targets: the scale pin (OG/FG/ABV) and the style-envelope
// bounded SRM/IBU sliders with their planned bitterness readouts. The pin is
// the one target root the navigator plots, so both modules read it.

import { STYLE_NODES as N } from "../../../views/registry/style.js";
import {
  SCALE_PINS,
  allowanceBounds,
  scalePinState,
  scaleTargetMismatch,
  targetDrift,
} from "../../../views/producer/styleTarget.js";
import { displayValue, nonlinearFns } from "../../../views/producer.js";
import { TAU } from "../../../engine/styleConformance.js";
import {
  bitternessRatio,
  boundsOf,
  formatRange,
  formatWithDecimals,
  provenanceFor,
  roundTo,
  toPercentValue,
} from "../../../utils.js";

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
        return boundsOf(this.fieldsById, N.envelope.srmMin, N.envelope.srmMax);
      },
    },
    styleIbuBounds: {
      configurable: true,
      get() {
        return boundsOf(this.fieldsById, N.envelope.ibuMin, N.envelope.ibuMax);
      },
    },
    // The sliders reach two just-noticeable differences past the envelope; the
    // envelope getters above stay the style's absolute bounds (scoring reads them).
    styleSrmSliderBounds: {
      configurable: true,
      get() {
        return allowanceBounds(this.styleSrmBounds, TAU.srm);
      },
    },
    styleIbuSliderBounds: {
      configurable: true,
      get() {
        return allowanceBounds(this.styleIbuBounds, TAU.ibu);
      },
    },
    // The slider's numbers follow the target field's display unit (the same
    // master/override resolution the input uses); the stored target stays SRM.
    styleSrmHint: {
      configurable: true,
      get() {
        const field = this.srmTargetField;
        const bounds = this.styleSrmBounds;
        if (!field?.unitId || !bounds) return "";
        const format = (value) =>
          formatWithDecimals(
            displayValue(artifact, "beer_color", field.unitId, value, nl),
            field.decimals
          );
        return `Style ${formatRange(bounds[0], bounds[1], format)} ${field.unit}`;
      },
    },
    srmTargetDisplay: {
      configurable: true,
      get() {
        const field = this.srmTargetField;
        if (!field?.unitId) return "";
        const shown = displayValue(artifact, "beer_color", field.unitId, this.targetSrm, nl);
        return `${formatWithDecimals(shown, field.decimals)} ${field.unit}`;
      },
    },
    srmTargetOutside: {
      configurable: true,
      get() {
        if (!this.srmTargetField) return false;
        return targetDrift(this.targetSrm, this.styleSrmBounds, TAU.srm, {
          unit: this.srmTargetField.unit,
          decimals: this.srmTargetField.decimals,
          toDisplay: this.srmTargetDelta,
        }).outside;
      },
    },
    srmTargetNote: {
      configurable: true,
      get() {
        const field = this.srmTargetField;
        if (!field) return "";
        return targetDrift(this.targetSrm, this.styleSrmBounds, TAU.srm, {
          unit: field.unit,
          decimals: field.decimals,
          toDisplay: this.srmTargetDelta,
        }).text;
      },
    },
    // A colour deviation converts like a value because every colour unit is
    // linear; the exact factor comes from the artifact, not from a constant.
    srmTargetDelta: {
      configurable: true,
      get() {
        const field = this.srmTargetField;
        const value = (base) =>
          field?.unitId ? displayValue(artifact, "beer_color", field.unitId, base, nl) : base;
        const scale = value(1) - value(0);
        return (deviation) => deviation * scale;
      },
    },
    ibuTargetOutside: {
      configurable: true,
      get() {
        return targetDrift(this.targetIbu, this.styleIbuBounds, TAU.ibu, { unit: "IBU", decimals: 0 })
          .outside;
      },
    },
    ibuTargetNote: {
      configurable: true,
      get() {
        return targetDrift(this.targetIbu, this.styleIbuBounds, TAU.ibu, { unit: "IBU", decimals: 0 })
          .text;
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
        return bitternessRatio(this.targetIbu, this.styleTargetInfo?.og);
      },
    },
    ibuGuDisplay: {
      configurable: true,
      get() {
        return formatWithDecimals(this.ibuGu, 2, { dash: "—" });
      },
    },
    whirlpoolPctDisplay: {
      configurable: true,
      get() {
        const fraction = this.whirlpoolFraction;
        return typeof fraction === "number" ? toPercentValue(fraction, 0) : 0;
      },
    },
    boilIbuDisplay: {
      configurable: true,
      get() {
        const ibu = this.boilIbu;
        return typeof ibu === "number" ? formatWithDecimals(ibu, 1) : "—";
      },
    },
    whirlpoolIbuDisplay: {
      configurable: true,
      get() {
        const ibu = this.whirlpoolIbu;
        return typeof ibu === "number" ? formatWithDecimals(ibu, 1) : "—";
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
