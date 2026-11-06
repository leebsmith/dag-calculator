// Style card / navigator: the fermentation-target navigator (OE/AE region, the
// batch's extract point, and the pin) plus the attenuation readouts that share
// the solved numbers. Region math lives in engine/fermentation.js and the SVG
// projection in views/producer/stylePlot.js; this module owns the card state.

import { extractFromTarget } from "../../../engine/fermentation.js";
import { attenuationCapSummary } from "../../../views/producer/attenuationCap.js";
import { gravityDisplay } from "../../../views/producer/gravityDisplay.js";
import {
  abvBoundsFor,
  abvTargetFor,
  gravityReadoutsFor,
  styleExtractPoint,
  stylePreviewModel,
  styleRegionState,
  targetInfoFor,
  targetNearestText,
  targetRiskFor,
} from "../../../views/styleNavigatorLogic.js";
import { STYLE_NODES as N } from "../../../views/registry/style.js";
import { masterUnit } from "../../../views/registry/units.js";
import { formatWithDecimals, roundTo } from "../../../utils.js";
import { reportError } from "../../../observability.js";

// The plot model is a pure function of five inputs and the template reads it
// ~53 times per render. Cache the model against their identities: a compute
// replaces the region/extract objects, so the model is rebuilt once per solve
// instead of once per binding.
let stylePreviewCache = null;

function stylePreviewFor(app) {
  const inputs = [
    app.styleRegion,
    app.styleExtract,
    app.styleSafestPoint,
    app.scalePin,
    app.activeScaleTarget,
    app.styleUnsolved,
    app.styleGravityDisplay,
    app.styleEnvelope,
  ];
  if (
    stylePreviewCache &&
    inputs.every((value, index) => value === stylePreviewCache.inputs[index])
  ) {
    return stylePreviewCache.model;
  }
  const [region, point, safestPoint, pin, target, unsolved, gravity, envelope] = inputs;
  const model = stylePreviewModel({
    region,
    point,
    safestPoint,
    pin,
    target,
    unsolved,
    gravity,
    envelope,
  });
  stylePreviewCache = { inputs, model };
  return model;
}

export function registerStyleNavigator(app, ctx) {
  const { engine } = ctx;

  Object.assign(app, {
    styleRegion: [],
    styleEnvelope: null,
    styleSafestPoint: null,
    styleExtract: null,
    styleAbvTouched: false,
    styleAbvCentered: false,
    styleSolvedAa: null,
    styleSolvedCap: null,
    styleSolvedVolume: null,
    attenuationBlend: null,
    attenuationCap: null,
    attenuationSugarLift: null,

    // ABV is the control; the OE/AE point is its inverse on the fixed-AA ray.
    // The region comes from the envelope (batch.style_* roots) so it tracks
    // envelope edits (WYSIWYG).
    computeStyleTarget() {
      Object.assign(
        this,
        styleRegionState({
          ogMin: engine.resolve(N.envelope.ogMin),
          ogMax: engine.resolve(N.envelope.ogMax),
          fgMin: engine.resolve(N.envelope.fgMin),
          fgMax: engine.resolve(N.envelope.fgMax),
          abvMin: engine.resolve(N.envelope.abvMin),
          abvMax: engine.resolve(N.envelope.abvMax),
        })
      );
      // A short region touches no boundary: the solved reads stay behind it.
      // Below an unrealized solve there is no batch point to place — the
      // envelope centroid would be a number no solve produced.
      this.styleExtract =
        this.styleRegion.length < 3 || this.styleUnsolved
          ? null
          : styleExtractPoint({
              region: this.styleRegion,
              solvedOg: engine.resolve(N.realized.og),
              solvedAa: engine.resolve(N.apparentAttenuation),
              fallbackAa: this.styleSolvedAa,
              targetAbv: engine.get(N.targetAbv),
            });
    },

    // Persist a free ABV target. The fixed-AA ray is a visualization, not a
    // constraint; the solver realizes OG/FG from the composition.
    writeStyleAbv(value) {
      if (!Number.isFinite(value) || value <= 0) return false;
      const aa = this.styleSolvedAa;
      if (Number.isFinite(aa) && aa < 1) {
        const inverse = extractFromTarget(aa, value);
        if (inverse) this.styleExtract = inverse;
      }
      this.setRoot(N.targetAbv, value);
      this.styleAbvCentered = true;
      return true;
    },

    setStyleTargetAbv(valueOrElement) {
      const element =
        valueOrElement && typeof valueOrElement === "object" ? valueOrElement : null;
      const raw = element ? element.value : valueOrElement;
      const previous = this.styleAbvTarget;
      const numeric = Number(raw);
      if (raw === "" || raw === null || !Number.isFinite(numeric) || numeric <= 0) {
        if (element) element.value = formatWithDecimals(previous, 1);
        return;
      }
      const target = roundTo(numeric, 1);
      if (!this.writeStyleAbv(target)) {
        if (element) element.value = formatWithDecimals(previous, 1);
        return;
      }
      this.styleAbvTouched = true;
      this.styleAbvCentered = true;
      if (element) element.value = formatWithDecimals(target, 1);
      this.scheduleSolve();
      this.notify();
    },

    centerOrClampStyleAbv() {
      return false;
    },

    afterCompute() {
      return;
    },

    onBatchLoad() {
      const hasTarget = this.master.getRoot(N.targetAbv) !== undefined;
      this.styleAbvTouched = hasTarget;
      this.styleAbvCentered = hasTarget;
      this.styleExtract = null;
      this.styleSolvedAa = null;
      this.styleSolvedCap = null;
      this.styleSolvedVolume = null;
    },

    resetStyleTarget() {
      this.resetScaleTarget();
    },

    styleTargetNearest() {
      return targetNearestText({
        nearest: this.styleTargetRisk?.nearest,
        gravity: this.styleGravityDisplay,
      });
    },
  });

  Object.defineProperties(app, {
    styleAbvBounds: {
      configurable: true,
      get() {
        return abvBoundsFor({
          extract: this.styleExtract,
          aa: this.styleSolvedAa,
          region: this.styleRegion,
        });
      },
    },
    styleAbvTarget: {
      configurable: true,
      get() {
        return abvTargetFor(engine.get(N.targetAbv), this.styleTargetInfo);
      },
    },
    // The master gravity pick governs the plot and every gravity readout on the
    // card. Per-field overrides stay per-field; a card-level figure is not a
    // field, so it follows the menu.
    styleGravityDisplay: {
      configurable: true,
      get() {
        return gravityDisplay(masterUnit(this.unitMode, "gravity") ?? "Plato");
      },
    },
    styleGravityReadouts: {
      configurable: true,
      get() {
        return gravityReadoutsFor({
          info: this.styleTargetInfo,
          gravity: this.styleGravityDisplay,
        });
      },
    },
    styleTargetInfo: {
      configurable: true,
      get() {
        return targetInfoFor({ extract: this.styleExtract });
      },
    },
    styleTargetRisk: {
      configurable: true,
      get() {
        return targetRiskFor({
          extract: this.styleExtract,
          safestPoint: this.styleSafestPoint,
          region: this.styleRegion,
          envelope: this.styleEnvelope,
        });
      },
    },
    stylePreview: {
      configurable: true,
      get() {
        return stylePreviewFor(this);
      },
    },
    styleUnsolved: {
      configurable: true,
      get() {
        return this.boundaryStatuses?.[N.solverBatch] !== "ok";
      },
    },
  });
}

export function refreshStyleNavigator(app, ctx) {
  const read = (path) => {
    try {
      return ctx.engine.resolve(path);
    } catch (err) {
      reportError("style.solvedAa", err);
      return undefined;
    }
  };
  app.styleSolvedAa = read(N.apparentAttenuation);
  app.styleSolvedCap = read(N.yeastCap);
  const attenuation = attenuationCapSummary(app.styleSolvedAa, app.styleSolvedCap);
  app.attenuationBlend = attenuation.blend;
  app.attenuationCap = attenuation.cap;
  // The delta is the artifact's value, so the card and the report cannot drift.
  // It is null when nothing exceeds the cap, which the partial renders as "—".
  app.attenuationSugarLift = read(N.aboveCap) ?? null;
  const postBoilVolume = read(N.postBoilVolume);
  app.styleSolvedVolume = Number.isFinite(postBoilVolume)
    ? postBoilVolume
    : ctx.engine.get(N.fermVolume);
  app.computeStyleTarget();
}

export const KEYS = [
  "styleRegion",
  "styleEnvelope",
  "styleSafestPoint",
  "styleExtract",
  "styleAbvTouched",
  "styleAbvCentered",
  "styleSolvedAa",
  "styleSolvedCap",
  "styleSolvedVolume",
  "attenuationBlend",
  "attenuationCap",
  "attenuationSugarLift",
  "computeStyleTarget",
  "writeStyleAbv",
  "setStyleTargetAbv",
  "centerOrClampStyleAbv",
  "afterCompute",
  "onBatchLoad",
  "resetStyleTarget",
  "styleTargetNearest",
  "styleAbvBounds",
  "styleAbvTarget",
  "styleGravityDisplay",
  "styleGravityReadouts",
  "styleTargetInfo",
  "styleTargetRisk",
  "stylePreview",
  "styleUnsolved",
];
