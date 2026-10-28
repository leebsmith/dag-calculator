// Mash profile card: preset + rest schedule + strike water. Bespoke (not a
// catalog draft editor); pure mash logic lives in views/mash.js and the card's
// readouts in views/producer/mashRows.js.

import * as mash from "../../views/mash.js";
import { toBase } from "../../engine/index.js";
import { displayValue, nonlinearFns } from "../../views/producer.js";
import {
  canonicalRestRows,
  isLgrBelowFloor,
  isRestOutsideBand,
  lgrSummary,
  mashTimeLabel,
  mashTimeSummaryLabel,
  materializeMashRests,
  restDefinition,
  restLabel,
  restMinutes,
  restPurposeLabel,
  restTempRangeLabel,
  temperatureLabel,
  thicknessLabel,
  wholeTemperature,
} from "../../views/producer/mashRows.js";
import { UNIT_SYMBOLS } from "../../views/registry/units.js";
import { unitSymbol } from "../../utils.js";
import { reportError } from "../../observability.js";
import { MASH_NODES as N } from "../../views/registry/mash.js";

export function registerMashCard(app, ctx) {
  const { engine, artifact } = ctx;

  Object.assign(app, {
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

    // Display conversion (base -> display) routed through the producer's
    // `displayValue` so unit conversion stays single-sourced (guard A8a).
    _convert(dimension, value, fallbackUnit) {
      if (value == null) return null;
      const unitId = this.unitMode?.[dimension] ?? fallbackUnit ?? null;
      return displayValue(artifact, dimension, unitId, value, nonlinearFns(artifact, engine));
    },

    restUseTempDisplay(rest) {
      if (!rest || rest.use_temp_c == null) return "";
      return temperatureLabel(this._convert("temperature", rest.use_temp_c, "degC"));
    },

    restTempRangeDisplay(restId) {
      const def = restDefinition(restId);
      if (!def || def.temp_min_c == null || def.temp_max_c == null) return "";
      return restTempRangeLabel(
        this._convert("temperature", def.temp_min_c, "degC"),
        this._convert("temperature", def.temp_max_c, "degC")
      );
    },

    restBoundDisplay(restId, bound) {
      const def = restDefinition(restId);
      if (!def) return "";
      const base = bound === "min" ? def.temp_min_c : def.temp_max_c;
      if (base == null) return "";
      return wholeTemperature(this._convert("temperature", base, "degC"));
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
      return (this.fieldsBySlice.mash ?? []).find((f) => f.id === id) ?? {};
    },

    strikeWaterTempDisplay() {
      const f = this.mashField(N.strikeTemp);
      if (!f || typeof f.value !== "number" || !Number.isFinite(f.value)) return "";
      return f.display;
    },

    _materializeRests(rows) {
      return materializeMashRests(rows);
    },

    _writeMashRests(rows) {
      engine.setCollection(N.rests, rows);
      this.scheduleSolve();
      this.notify();
    },

    onMashPresetChange(presetId) {
      this.setRoot(N.presetId, presetId);
      this._writeMashRests(mash.applyMashPreset(this._materializeRests(this.mashRests), presetId));
    },

    toggleMashRest(restId, enabled) {
      this.setRoot(N.presetId, "custom");
      const def = mash.getCanonicalRest(restId);
      const shouldEnable = !!enabled;
      // The combined amylase rest replaces the pair (and vice versa); the rows'
      // temperatures and durations are kept so toggling back restores them.
      const conflicting = new Set(
        shouldEnable ? mash.conflictingRests(restId) : []
      );
      const rows = this._materializeRests(this.mashRests).map((r) => {
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
      this._writeMashRests(rows);
    },

    // Configure Rests modal (draft/cancel): edits land in a scratch copy and
    // are committed on OK; Cancel discards.
    openMashModal() {
      this.mashDraft = JSON.parse(JSON.stringify(this._materializeRests(this.mashRests)));
      this.mashDraftDirty = false;
      this.mashModalOpen = true;
    },

    closeMashModal() {
      this.mashModalOpen = false;
      this.mashDraft = [];
      this.mashDraftDirty = false;
    },

    commitMashSchedule() {
      if (this.mashDraftDirty) this.setRoot(N.presetId, "custom");
      this._writeMashRests(JSON.parse(JSON.stringify(this.mashDraft)));
      this.closeMashModal();
    },

    mashDraftRow(restId) {
      return this.mashDraft.find((r) => r.rest_id === restId) ?? null;
    },

    setMashDraftTemp(restId, displayVal) {
      const row = this.mashDraftRow(restId);
      if (!row) return;
      row.use_temp_c =
        displayVal === ""
          ? null
          : toBase(artifact, "temperature", this.unitMode?.temperature ?? "degC", Number(displayVal));
      if (row.use_temp_c != null && Number.isNaN(row.use_temp_c)) row.use_temp_c = null;
      this.mashDraftDirty = true;
    },

    setMashDraftDuration(restId, displayVal) {
      const row = this.mashDraftRow(restId);
      if (!row) return;
      if (displayVal === "") {
        row.duration_min = null;
      } else {
        const n = Number(displayVal);
        row.duration_min = Number.isNaN(n) ? null : n;
      }
      this.mashDraftDirty = true;
    },
  });

  Object.defineProperties(app, {
    mashPresetIdState: { configurable: true, writable: true, value: null },
    mashPresetLabels: {
      configurable: true,
      get() {
        return mash.MASH_PRESET_LABELS;
      },
    },
    mashPresetId: {
      configurable: true,
      get() {
        return this.mashPresetIdState ?? "custom";
      },
    },
    canonicalMashRests: {
      configurable: true,
      get() {
        return canonicalRestRows(this.mashRests);
      },
    },
    sortedMashRests: {
      configurable: true,
      get() {
        return mash.sortRestsByTemperature(this.mashRests);
      },
    },
    enabledMashRests: {
      configurable: true,
      get() {
        return this.sortedMashRests.filter((r) => r.enabled);
      },
    },
    doughInInheritedTempC: {
      configurable: true,
      get() {
        return this.mashDoughInTempC;
      },
    },
    temperatureUnit: {
      configurable: true,
      get() {
        const unitId = this.unitMode?.temperature ?? "degC";
        return unitSymbol(UNIT_SYMBOLS, "temperature", unitId);
      },
    },
    doughInDisplay: {
      configurable: true,
      get() {
        const v = this.doughInInheritedTempC;
        if (v == null) return "";
        return temperatureLabel(this._convert("temperature", v, "degC"));
      },
    },
    totalMashTimeMin: {
      configurable: true,
      get() {
        return this.mashTotalTimeMin;
      },
    },
    totalMashTimeDisplay: {
      configurable: true,
      get() {
        return mashTimeLabel(this.totalMashTimeMin);
      },
    },
    rampTimeMin: {
      configurable: true,
      get() {
        return this.mashRampTimeMin;
      },
    },
    restTimeMin: {
      configurable: true,
      get() {
        return restMinutes(this.mashTotalTimeMin, this.mashRampTimeMin);
      },
    },
    mashThicknessUnitId: {
      configurable: true,
      get() {
        return this.unitMode?.mash_thickness ?? "L_per_kg";
      },
    },
    mashThicknessUnit: {
      configurable: true,
      get() {
        return unitSymbol(UNIT_SYMBOLS, "mash_thickness", this.mashThicknessUnitId);
      },
    },
    mashThicknessDisplay: {
      configurable: true,
      get() {
        const v = this.mashThicknessLPerKg;
        if (!Number.isFinite(v)) return "";
        return thicknessLabel(
          displayValue(artifact, "mash_thickness", this.mashThicknessUnitId, v, nonlinearFns(artifact, engine))
        );
      },
    },
    minLgrDisplay: {
      configurable: true,
      get() {
        const v = this.minLgrLPerKg;
        if (!Number.isFinite(v)) return "";
        return thicknessLabel(
          displayValue(artifact, "mash_thickness", this.mashThicknessUnitId, v, nonlinearFns(artifact, engine))
        );
      },
    },
    mashLgrBelowFloor: {
      configurable: true,
      get() {
        return isLgrBelowFloor(this.mashThicknessLPerKg, this.minLgrLPerKg);
      },
    },
    mashLgrSummary: {
      configurable: true,
      get() {
        return lgrSummary(this.mashThicknessDisplay, this.mashThicknessUnit, this.minLgrDisplay);
      },
    },
    mashTimeSummary: {
      configurable: true,
      get() {
        return mashTimeSummaryLabel(this.rampTimeMin, this.restTimeMin);
      },
    },
    sortedMashDraftRests: {
      configurable: true,
      get() {
        return mash.sortRestsByTemperature(this.mashDraft).filter((r) => r.enabled);
      },
    },
    isMashDraftValid: {
      configurable: true,
      get() {
        return mash.isMashScheduleValid(this.sortedMashDraftRests);
      },
    },
  });
}

export function refreshMashCard(app, ctx) {
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
