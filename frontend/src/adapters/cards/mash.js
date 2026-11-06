// Mash profile card: preset + rest schedule + strike water. Bespoke (not a
// catalog draft editor); pure mash logic lives in views/mash.js and the card's
// readouts in views/producer/mashRows.js.

import * as mash from "../../views/mash.js";
import { toBase } from "../../engine/index.js";
import { displayValue, nonlinearFns } from "../../views/producer.js";
import {
  isRestOutsideBand,
  materializeMashRests,
  restDefinition,
  restLabel,
  restPurposeLabel,
  restTempRangeLabel,
  temperatureLabel,
  wholeTemperature,
} from "../../views/producer/mashRows.js";
import {
  draftDescriptors,
  presetDescriptors,
  thicknessDescriptors,
  timeDescriptors,
} from "./mashGetters.js";
import { MASH_NODES as N } from "../../views/registry/mash.js";
import { ignoreError } from "../../observability.js";

function conversionActions({ artifact, engine, getView }) {
  return {
    // Display conversion (base -> display) routed through the producer's
    // `displayValue` so unit conversion stays single-sourced (guard A8a).
    _convert(dimension, value, fallbackUnit) {
      if (value == null) return null;
      const unitId = getView().unitMode?.[dimension] ?? fallbackUnit ?? null;
      return displayValue(artifact, dimension, unitId, value, nonlinearFns(artifact, engine));
    },

    restUseTempDisplay(rest) {
      if (!rest || rest.use_temp_c == null) return "";
      return temperatureLabel(getView()._convert("temperature", rest.use_temp_c, "degC"));
    },

    restTempRangeDisplay(restId) {
      const def = restDefinition(restId);
      if (!def || def.temp_min_c == null || def.temp_max_c == null) return "";
      const view = getView();
      return restTempRangeLabel(
        view._convert("temperature", def.temp_min_c, "degC"),
        view._convert("temperature", def.temp_max_c, "degC")
      );
    },

    restBoundDisplay(restId, bound) {
      const def = restDefinition(restId);
      if (!def) return "";
      const base = bound === "min" ? def.temp_min_c : def.temp_max_c;
      if (base == null) return "";
      return wholeTemperature(getView()._convert("temperature", base, "degC"));
    },

    getRestDefinition(restId) {
      return restDefinition(restId);
    },

    restName(restId) {
      return restLabel(restId);
    },

    restPurpose(restId) {
      return restPurposeLabel(restId);
    },

    isRestOutOfRange(restId, useTempC) {
      return isRestOutsideBand(restId, useTempC);
    },

    // Field-model accessor for the metric strip (reuses producer display/write).
    mashField(id) {
      return (getView().fieldsBySlice.mash ?? []).find((f) => f.id === id) ?? {};
    },

    strikeWaterTempDisplay() {
      const f = getView().mashField(N.strikeTemp);
      if (!f || typeof f.value !== "number" || !Number.isFinite(f.value)) return "";
      return f.display;
    },
  };
}

function scheduleActions({ engine, getView }) {
  return {
    _materializeRests(rows) {
      return materializeMashRests(rows);
    },

    _writeMashRests(rows) {
      const view = getView();
      engine.setCollection(N.rests, rows);
      view.scheduleSolve();
      view.notify();
    },

    onMashPresetChange(presetId) {
      const view = getView();
      view.setRoot(N.presetId, presetId);
      view._writeMashRests(mash.applyMashPreset(view._materializeRests(view.mashRests), presetId));
    },

    toggleMashRest(restId, enabled) {
      const view = getView();
      view.setRoot(N.presetId, "custom");
      const def = mash.getCanonicalRest(restId);
      const shouldEnable = !!enabled;
      // The combined amylase rest replaces the pair (and vice versa); the rows'
      // temperatures and durations are kept so toggling back restores them.
      const conflicting = new Set(shouldEnable ? mash.conflictingRests(restId) : []);
      const rows = view._materializeRests(view.mashRests).map((r) => {
        if (conflicting.has(r.rest_id)) return { ...r, enabled: false };
        if (r.rest_id !== restId) return r;
        return {
          ...r,
          enabled: shouldEnable,
          use_temp_c:
            shouldEnable && r.use_temp_c == null && def && def.temp_min_c != null
              ? (def.temp_min_c + def.temp_max_c) / 2
              : r.use_temp_c,
          duration_min:
            shouldEnable && r.duration_min == null && def ? def.default_duration_min : r.duration_min,
        };
      });
      view._writeMashRests(rows);
    },
  };
}

function modalActions({ artifact, getView }) {
  return {
    // Configure Rests modal (draft/cancel): edits land in a scratch copy and
    // are committed on OK; Cancel discards.
    openMashModal() {
      const view = getView();
      view.mashDraft = JSON.parse(JSON.stringify(view._materializeRests(view.mashRests)));
      view.mashDraftDirty = false;
      view.mashModalOpen = true;
    },

    closeMashModal() {
      const view = getView();
      view.mashModalOpen = false;
      view.mashDraft = [];
      view.mashDraftDirty = false;
    },

    commitMashSchedule() {
      const view = getView();
      if (view.mashDraftDirty) view.setRoot(N.presetId, "custom");
      view._writeMashRests(JSON.parse(JSON.stringify(view.mashDraft)));
      view.closeMashModal();
    },

    mashDraftRow(restId) {
      return getView().mashDraft.find((r) => r.rest_id === restId) ?? null;
    },

    setMashDraftTemp(restId, displayVal) {
      const view = getView();
      const row = view.mashDraftRow(restId);
      if (!row) return;
      row.use_temp_c =
        displayVal === ""
          ? null
          : toBase(artifact, "temperature", view.unitMode?.temperature ?? "degC", Number(displayVal));
      if (row.use_temp_c != null && Number.isNaN(row.use_temp_c)) row.use_temp_c = null;
      view.mashDraftDirty = true;
    },

    setMashDraftDuration(restId, displayVal) {
      const view = getView();
      const row = view.mashDraftRow(restId);
      if (!row) return;
      if (displayVal === "") {
        row.duration_min = null;
      } else {
        const n = Number(displayVal);
        row.duration_min = Number.isNaN(n) ? null : n;
      }
      view.mashDraftDirty = true;
    },
  };
}

export function createMashCard(ctx) {
  const actions = {
    // Rests collection rows in base units, refreshed in compute(); the partial
    // and modal bind to these plus the scalar field models in fieldsBySlice.mash.
    mashRests: [],
    mashDoughInTempC: null,
    mashTotalTimeMin: null,
    mashRampTimeMin: null,
    mashThicknessLPerKg: null,
    minLgrLPerKg: null,
    mashModalOpen: false,
    mashDraft: [],
    mashDraftDirty: false,
    ...conversionActions(ctx),
    ...scheduleActions(ctx),
    ...modalActions(ctx),
  };
  Object.defineProperties(actions, {
    ...presetDescriptors(ctx),
    ...timeDescriptors(ctx),
    ...thicknessDescriptors(ctx),
    ...draftDescriptors(ctx),
  });
  return actions;
}

export function createMashLayers(ctx) {
  return [createMashCard(ctx)];
}

export function registerMashCard(app, ctx = {}) {
  const actions = createMashCard({ ...ctx, getView: ctx.getView ?? (() => app) });
  Object.defineProperties(app, Object.getOwnPropertyDescriptors(actions));
  return actions;
}

export function refreshMashCard(app, ctx) {
  // The silent fallback is for direct unit tests; the app state always carries
  // the observability manager.
  const reportError = ctx.observability?.reportError ?? ignoreError;
  app.mashPresetIdState = ctx.engine.get(N.presetId) ?? "custom";
  app.mashRests = (ctx.engine.get(N.rests) ?? []).filter((r) => r.rest_id !== "dough_in");
  app.mashDoughInTempC = ctx.engine.get(N.doughInTarget);
  app.mashTotalTimeMin = ctx.engine.get(N.totalTime);
  app.mashRampTimeMin = ctx.engine.get(N.rampTime);
  try {
    app.mashThicknessLPerKg = ctx.engine.resolve(N.mashThickness) ?? null;
  } catch (err) {
    reportError("mashCard.mashThickness", err);
    app.mashThicknessLPerKg = null;
  }
  app.minLgrLPerKg = ctx.engine.identity?.equipment?.min_lgr_l_per_kg ?? null;
}

export const KEYS = ["mashRests", "mashDoughInTempC", "mashTotalTimeMin", "mashRampTimeMin", "mashThicknessLPerKg", "minLgrLPerKg", "mashModalOpen", "mashDraft", "mashDraftDirty", "_convert", "restUseTempDisplay", "restTempRangeDisplay", "restBoundDisplay", "getRestDefinition", "restName", "restPurpose", "isRestOutOfRange", "mashField", "strikeWaterTempDisplay", "_materializeRests", "_writeMashRests", "onMashPresetChange", "toggleMashRest", "openMashModal", "closeMashModal", "commitMashSchedule", "mashDraftRow", "setMashDraftTemp", "setMashDraftDuration", "mashPresetLabels", "mashPresetId", "mashPresetIdState", "canonicalMashRests", "sortedMashRests", "enabledMashRests", "doughInInheritedTempC", "temperatureUnit", "doughInDisplay", "totalMashTimeMin", "totalMashTimeDisplay", "rampTimeMin", "restTimeMin", "mashThicknessUnitId", "mashThicknessUnit", "mashThicknessDisplay", "minLgrDisplay", "mashLgrBelowFloor", "mashLgrSummary", "mashTimeSummary", "sortedMashDraftRests", "isMashDraftValid"];
