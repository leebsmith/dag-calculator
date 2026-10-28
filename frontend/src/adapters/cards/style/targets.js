// Style card / targets: the scale pin (OG/FG/ABV) and the style-envelope
// bounded SRM/IBU sliders with their planned bitterness readouts. The pin is
// the one target root the navigator plots, so both modules read it.

import { STYLE_NODES as N } from "../../../views/registry/style.js";
import {
  bitternessRatio,
  boundsOf,
  formatGravity,
  formatWithDecimals,
  provenanceFor,
  roundTo,
  toPercentValue,
} from "../../../utils.js";

const SCALE_PINS = [
  { value: "abv", label: "ABV" },
  { value: "og", label: "OG" },
  { value: "fg", label: "FG" },
];

function fmtTarget(pin, value) {
  if (pin === "abv") return `${formatWithDecimals(value, 1)}%`;
  return formatGravity(value);
}

export function registerStyleTargets(app, ctx) {
  const { engine } = ctx;

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
      const label = SCALE_PINS.find((entry) => entry.value === pin)?.label ?? "ABV";
      const raw = engine.get(root);
      const value = typeof raw === "number" && Number.isFinite(raw) ? raw : null;
      this.scalePin = pin;
      this.scalePinLabel = label;
      this.activeScaleTargetRoot = root;
      this.activeScaleTarget = value;
      this.activeScaleTargetLabel = `Target ${label}`;
      this.activeScaleTargetUnit = pin === "abv" ? "%" : "SG";
      this.activeScaleTargetStep = pin === "abv" ? "0.1" : "0.001";
      this.activeScaleTargetDisplay =
        value == null
          ? ""
          : pin === "abv"
            ? formatWithDecimals(value, 1)
            : formatGravity(value);
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
      const target =
        this.scalePin === "abv" ? roundTo(numeric, 1) : numeric;
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

  const target = app.activeScaleTarget;
  const info = app.styleTargetInfo;
  let mismatch = "";
  if (target != null && info) {
    const realized =
      app.scalePin === "abv" ? info.abv : app.scalePin === "og" ? info.og : info.fg;
    const tolerance = app.scalePin === "abv" ? 0.15 : 0.002;
    if (Number.isFinite(realized) && Math.abs(realized - target) > tolerance) {
      const status = app.boundaryStatuses?.[N.solverBatch] ?? "unknown";
      mismatch =
        `Target ${fmtTarget(app.scalePin, target)} vs realized ` +
        `${fmtTarget(app.scalePin, realized)} — solve ${status}.`;
    }
  }
  app.scaleTargetMismatch = mismatch;
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
