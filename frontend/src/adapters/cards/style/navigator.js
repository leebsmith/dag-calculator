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
import { ignoreError } from "../../../observability.js";

function navigatorActions({ engine, getView }) {
  return {
    // ABV is the control; the OE/AE point is its inverse on the fixed-AA ray.
    // The region comes from the envelope (batch.style_* roots) so it tracks
    // envelope edits (WYSIWYG).
    computeStyleTarget() {
      const view = getView();
      Object.assign(
        view,
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
      view.styleExtract =
        view.styleRegion.length < 3 || view.styleUnsolved
          ? null
          : styleExtractPoint({
              region: view.styleRegion,
              solvedOg: engine.resolve(N.realized.og),
              solvedAa: engine.resolve(N.apparentAttenuation),
              fallbackAa: view.styleSolvedAa,
              targetAbv: engine.get(N.targetAbv),
            });
    },

    // Explicit state update: the getter only reads this snapshot. The pure
    // projection lives in views/styleNavigatorLogic.js.
    updateStylePreview() {
      const view = getView();
      view.stylePreviewState = stylePreviewModel({
        region: view.styleRegion,
        point: view.styleExtract,
        safestPoint: view.styleSafestPoint,
        pin: view.scalePin,
        target: view.activeScaleTarget,
        unsolved: view.styleUnsolved,
        gravity: view.styleGravityDisplay,
        envelope: view.styleEnvelope,
      });
    },

    // Persist a free ABV target. The fixed-AA ray is a visualization, not a
    // constraint; the solver realizes OG/FG from the composition.
    writeStyleAbv(value) {
      const view = getView();
      if (!Number.isFinite(value) || value <= 0) return false;
      const aa = view.styleSolvedAa;
      if (Number.isFinite(aa) && aa < 1) {
        const inverse = extractFromTarget(aa, value);
        if (inverse) view.styleExtract = inverse;
      }
      view.setRoot(N.targetAbv, value);
      view.styleAbvCentered = true;
      view.updateStylePreview();
      return true;
    },

    setStyleTargetAbv(valueOrElement) {
      const view = getView();
      const element =
        valueOrElement && typeof valueOrElement === "object" ? valueOrElement : null;
      const raw = element ? element.value : valueOrElement;
      const previous = view.styleAbvTarget;
      const numeric = Number(raw);
      if (raw === "" || raw === null || !Number.isFinite(numeric) || numeric <= 0) {
        if (element) element.value = formatWithDecimals(previous, 1);
        return;
      }
      const target = roundTo(numeric, 1);
      if (!view.writeStyleAbv(target)) {
        if (element) element.value = formatWithDecimals(previous, 1);
        return;
      }
      view.styleAbvTouched = true;
      view.styleAbvCentered = true;
      if (element) element.value = formatWithDecimals(target, 1);
      view.scheduleSolve();
      view.notify();
    },

    centerOrClampStyleAbv() {
      return false;
    },

    afterCompute() {
      return;
    },

    onBatchLoad() {
      const view = getView();
      const hasTarget = view.master.getRoot(N.targetAbv) !== undefined;
      view.styleAbvTouched = hasTarget;
      view.styleAbvCentered = hasTarget;
      view.styleExtract = null;
      view.styleSolvedAa = null;
      view.styleSolvedCap = null;
      view.styleSolvedVolume = null;
    },

    resetStyleTarget() {
      getView().resetScaleTarget();
    },

    styleTargetNearest() {
      const view = getView();
      return targetNearestText({
        nearest: view.styleTargetRisk?.nearest,
        gravity: view.styleGravityDisplay,
      });
    },
  };
}

function navigatorDescriptors({ engine, getView }) {
  return {
    styleAbvBounds: {
      configurable: true,
      get() {
        const view = getView();
        return abvBoundsFor({
          extract: view.styleExtract,
          aa: view.styleSolvedAa,
          region: view.styleRegion,
        });
      },
    },
    styleAbvTarget: {
      configurable: true,
      get() {
        return abvTargetFor(engine.get(N.targetAbv), getView().styleTargetInfo);
      },
    },
    // The master gravity pick governs the plot and every gravity readout on the
    // card. Per-field overrides stay per-field; a card-level figure is not a
    // field, so it follows the menu.
    styleGravityDisplay: {
      configurable: true,
      get() {
        return gravityDisplay(masterUnit(getView().unitMode, "gravity") ?? "Plato");
      },
    },
    styleGravityReadouts: {
      configurable: true,
      get() {
        const view = getView();
        return gravityReadoutsFor({
          info: view.styleTargetInfo,
          gravity: view.styleGravityDisplay,
        });
      },
    },
    styleTargetInfo: {
      configurable: true,
      get() {
        return targetInfoFor({ extract: getView().styleExtract });
      },
    },
    styleTargetRisk: {
      configurable: true,
      get() {
        const view = getView();
        return targetRiskFor({
          extract: view.styleExtract,
          safestPoint: view.styleSafestPoint,
          region: view.styleRegion,
          envelope: view.styleEnvelope,
        });
      },
    },
    stylePreview: {
      configurable: true,
      get() {
        return getView().stylePreviewState;
      },
    },
    styleUnsolved: {
      configurable: true,
      get() {
        return getView().boundaryStatuses?.[N.solverBatch] !== "ok";
      },
    },
  };
}

export function createStyleNavigator(ctx) {
  const actions = {
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
    stylePreviewState: null,
    ...navigatorActions(ctx),
  };
  Object.defineProperties(actions, navigatorDescriptors(ctx));
  return actions;
}

export function refreshStyleNavigator(app, ctx) {
  // The silent fallback is for direct unit tests; the app state always carries
  // the observability manager.
  const reportError = ctx.observability?.reportError ?? ignoreError;
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
  app.attenuationBlend = attenuationCapSummary(app.styleSolvedAa, app.styleSolvedCap).blend;
  const postBoilVolume = read(N.postBoilVolume);
  app.styleSolvedVolume = Number.isFinite(postBoilVolume)
    ? postBoilVolume
    : ctx.engine.get(N.fermVolume);
  app.computeStyleTarget();
  app.updateStylePreview();
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
  "stylePreviewState",
  "computeStyleTarget",
  "updateStylePreview",
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
