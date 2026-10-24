// Mash profile card: preset + rest schedule + strike water + advisory
// attenuation estimate. Bespoke (not a catalog draft editor); pure mash logic
// lives in views/mash.js and views/mashAttenuation.js.

import * as mash from "../../views/mash.js";
import { predictMashAttenuation } from "../../views/mashAttenuation.js";
import { toBase } from "../../engine/index.js";
import { displayValue, nonlinearFns } from "../../views/producer.js";
import { UNIT_SYMBOLS } from "../../views/registry/units.js";
import { MASH_NODES as N } from "../../views/registry/mash.js";

const SHAPE_LABELS = {
  none: "No rests",
  single_step: "Single-step",
  multi_step: "Multi-step",
};

export function registerMashCard(app, ctx) {
  const { engine, artifact } = ctx;

  function safeGet(path) {
    try {
      return engine.resolve(path);
    } catch {
      try {
        return engine.get(path);
      } catch {
        return undefined;
      }
    }
  }

  Object.assign(app, {
    // Rests collection rows in base units, refreshed in compute(); the partial
    // and modal bind to these plus the scalar field models in fieldsBySlice.mash.
    mashRests: [],
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

    _constant(id) {
      return artifact.constants[id]?.value ?? null;
    },

    restUseTempDisplay(rest) {
      if (!rest || rest.use_temp_c == null) return "";
      const v = this._convert("temperature", rest.use_temp_c, "degC");
      return Number.isFinite(v) ? v.toFixed(1) : "";
    },

    restTempRangeDisplay(restId) {
      const def = mash.getCanonicalRest(restId);
      if (!def || def.temp_min_c == null || def.temp_max_c == null) return "";
      const min = this._convert("temperature", def.temp_min_c, "degC");
      const max = this._convert("temperature", def.temp_max_c, "degC");
      return `${Math.round(min)}–${Math.round(max)}`;
    },

    restBoundDisplay(restId, bound) {
      const def = mash.getCanonicalRest(restId);
      if (!def) return "";
      const base = bound === "min" ? def.temp_min_c : def.temp_max_c;
      if (base == null) return "";
      return Math.round(this._convert("temperature", base, "degC"));
    },

    getRestDefinition(restId) {
      return mash.getCanonicalRest(restId);
    },

    restName(restId) {
      const def = mash.getCanonicalRest(restId);
      return def ? def.name : restId;
    },

    restPurpose(restId) {
      const def = mash.getCanonicalRest(restId);
      return def ? def.purpose : "";
    },

    isRestOutOfRange(restId, useTempC) {
      const rest = mash.getCanonicalRest(restId);
      if (!rest || rest.temp_min_c == null || rest.temp_max_c == null) return false;
      if (typeof useTempC !== "number" || isNaN(useTempC)) return false;
      return useTempC < rest.temp_min_c || useTempC > rest.temp_max_c;
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
      const byId = new Map(rows.filter((r) => r.rest_id !== "dough_in").map((r) => [r.rest_id, r]));
      const order = [...mash.CANONICAL_RESTS.map((r) => r.rest_id), mash.MASH_OUT_REST.rest_id];
      return order.map((id) => {
        const existing = byId.get(id);
        if (existing) return { ...existing };
        const isMashOut = id === mash.MASH_OUT_REST.rest_id;
        return {
          rest_id: id,
          enabled: isMashOut,
          use_temp_c: null,
          duration_min: isMashOut ? mash.MASH_OUT_REST.default_duration_min : null,
        };
      });
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
      const rows = this._materializeRests(this.mashRests).map((r) => {
        if (r.rest_id !== restId) return r;
        const shouldEnable = !!enabled;
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

    _percentDisplay(value) {
      if (!Number.isFinite(value)) return "";
      const v = displayValue(artifact, "percentage", "pct", value, nonlinearFns(artifact, engine));
      return Number.isFinite(v) ? v.toFixed(1) : "";
    },
  });

  Object.defineProperties(app, {
    mashPresetLabels: {
      configurable: true,
      get() {
        return mash.MASH_PRESET_LABELS;
      },
    },
    mashPresetId: {
      configurable: true,
      get() {
        return engine.get(N.presetId);
      },
    },
    canonicalMashRests: {
      configurable: true,
      get() {
        const byId = new Map(this.mashRests.map((r) => [r.rest_id, r]));
        return [...mash.CANONICAL_RESTS, mash.MASH_OUT_REST].map((def) => {
          const row = byId.get(def.rest_id);
          return {
            ...def,
            enabled: row ? !!row.enabled : def.rest_id === mash.MASH_OUT_REST.rest_id,
            use_temp_c: row ? row.use_temp_c : null,
            duration_min: row ? row.duration_min : null,
          };
        });
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
        return engine.get(N.doughInTarget);
      },
    },
    temperatureUnit: {
      configurable: true,
      get() {
        const unitId = this.unitMode?.temperature ?? "degC";
        return UNIT_SYMBOLS.temperature[unitId] ?? unitId;
      },
    },
    doughInDisplay: {
      configurable: true,
      get() {
        const v = this.doughInInheritedTempC;
        if (v == null) return "";
        const d = this._convert("temperature", v, "degC");
        return Number.isFinite(d) ? d.toFixed(1) : "";
      },
    },
    totalMashTimeMin: {
      configurable: true,
      get() {
        return mash.totalMashDurationMin(this.enabledMashRests);
      },
    },
    mashHeatingRateCPerMin: {
      configurable: true,
      get() {
        const v = safeGet(N.heatingRate);
        return Number.isFinite(v) ? v : this._constant("default_mash_heating_rate_c_per_min");
      },
    },
    rampRateDisplay: {
      configurable: true,
      get() {
        const v = this.mashHeatingRateCPerMin;
        if (!Number.isFinite(v)) return "";
        const d = this._convert("temperature_delta_per_time", v, "dC_per_min");
        return Number.isFinite(d) ? d.toFixed(2) : "";
      },
    },
    rampRateUnit: {
      configurable: true,
      get() {
        const unitId = this.unitMode?.temperature_delta_per_time ?? "dC_per_min";
        return UNIT_SYMBOLS.temperature_delta_per_time[unitId] ?? unitId;
      },
    },
    attenuationBaseline: {
      configurable: true,
      get() {
        const v = safeGet(N.yeastAttenuation);
        return Number.isFinite(v) && v > 0 && v <= 1 ? v : null;
      },
    },
    batchAttenuation: {
      configurable: true,
      get() {
        const v = safeGet(N.batchAttenuation);
        return Number.isFinite(v) ? v : null;
      },
    },
    attenuationModel: {
      configurable: true,
      get() {
        return predictMashAttenuation({
          rests: this.mashRests,
          rampRateCPerMin: this.mashHeatingRateCPerMin,
          aaRef: this.attenuationBaseline,
          tempCoefficient: this._constant("mash_attenuation_temp_coefficient"),
          refTempC: this._constant("mash_attenuation_ref_temp_c"),
          lowC: this._constant("mash_conversion_window_low_c"),
          highC: this._constant("mash_conversion_window_high_c"),
        });
      },
    },
    predictedAttenuation: {
      configurable: true,
      get() {
        return this.attenuationModel?.aa ?? null;
      },
    },
    attenuationDelta: {
      configurable: true,
      get() {
        return this.attenuationModel?.delta ?? null;
      },
    },
    attenuationBand: {
      configurable: true,
      get() {
        return this._constant("mash_attenuation_band");
      },
    },
    attenuationInBand: {
      configurable: true,
      get() {
        const delta = this.attenuationDelta;
        const band = this.attenuationBand;
        return Number.isFinite(delta) && Number.isFinite(band) ? Math.abs(delta) <= band : null;
      },
    },
    effectiveConversionTempC: {
      configurable: true,
      get() {
        return this.attenuationModel?.effectiveTempC ?? null;
      },
    },
    predictedAttenuationDisplay: {
      configurable: true,
      get() {
        return this._percentDisplay(this.predictedAttenuation);
      },
    },
    attenuationBaselineDisplay: {
      configurable: true,
      get() {
        return this._percentDisplay(this.attenuationBaseline);
      },
    },
    batchAttenuationDisplay: {
      configurable: true,
      get() {
        return this._percentDisplay(this.batchAttenuation);
      },
    },
    attenuationDeltaDisplay: {
      configurable: true,
      get() {
        const delta = this.attenuationDelta;
        if (!Number.isFinite(delta)) return "";
        const d = displayValue(artifact, "percentage", "pct", Math.abs(delta), nonlinearFns(artifact, engine));
        if (!Number.isFinite(d)) return "";
        return `${delta < 0 ? "−" : "+"}${d.toFixed(1)}`;
      },
    },
    attenuationBandDisplay: {
      configurable: true,
      get() {
        return this._percentDisplay(this.attenuationBand);
      },
    },
    effectiveConversionTempDisplay: {
      configurable: true,
      get() {
        const v = this.effectiveConversionTempC;
        if (!Number.isFinite(v)) return "";
        const d = this._convert("temperature", v, "degC");
        return Number.isFinite(d) ? d.toFixed(1) : "";
      },
    },
    mashShapeLabel: {
      configurable: true,
      get() {
        return SHAPE_LABELS[engine.get(N.shape)] ?? "";
      },
    },
    mashRestCount: {
      configurable: true,
      get() {
        const v = engine.get(N.restCount);
        return Number.isFinite(v) ? v : null;
      },
    },
    mashShapeSummary: {
      configurable: true,
      get() {
        const label = this.mashShapeLabel;
        const count = this.mashRestCount;
        if (!label || count == null) return "";
        return `${label} · ${count} ${count === 1 ? "rest" : "rests"}`;
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
  app.mashRests = (ctx.engine.get(N.rests) ?? []).filter((r) => r.rest_id !== "dough_in");
}

export const KEYS = ["mashRests", "mashModalOpen", "mashDraft", "mashDraftDirty", "_convert", "_constant", "restUseTempDisplay", "restTempRangeDisplay", "restBoundDisplay", "getRestDefinition", "restName", "restPurpose", "isRestOutOfRange", "mashField", "strikeWaterTempDisplay", "_materializeRests", "_writeMashRests", "onMashPresetChange", "toggleMashRest", "openMashModal", "closeMashModal", "commitMashSchedule", "mashDraftRow", "setMashDraftTemp", "setMashDraftDuration", "_percentDisplay", "mashPresetLabels", "mashPresetId", "canonicalMashRests", "sortedMashRests", "enabledMashRests", "doughInInheritedTempC", "temperatureUnit", "doughInDisplay", "totalMashTimeMin", "mashHeatingRateCPerMin", "rampRateDisplay", "rampRateUnit", "attenuationBaseline", "batchAttenuation", "attenuationModel", "predictedAttenuation", "attenuationDelta", "attenuationBand", "attenuationInBand", "effectiveConversionTempC", "predictedAttenuationDisplay", "attenuationBaselineDisplay", "batchAttenuationDisplay", "attenuationDeltaDisplay", "attenuationBandDisplay", "effectiveConversionTempDisplay", "mashShapeLabel", "mashRestCount", "mashShapeSummary", "sortedMashDraftRests", "isMashDraftValid"];
