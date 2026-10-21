// Mash profile card: preset + rest schedule + strike water + limit of
// attenuation. Bespoke (not a catalog draft editor); pure mash logic lives in
// views/mash.js.

import * as mash from "../../views/mash.js";
import { toBase } from "../../engine/index.js";
import { displayValue, nonlinearFns } from "../../views/producer.js";
import { UNIT_SYMBOLS } from "../../views/registry/units.js";
import { MASH_NODES as N } from "../../views/registry/mash.js";

export function registerMashCard(app, ctx) {
  const { engine, ui, artifact } = ctx;

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
      const unitId = ui.unitMode[dimension] ?? fallbackUnit ?? null;
      return displayValue(artifact, dimension, unitId, value, nonlinearFns(artifact, engine));
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

    limitOfAttenuationDisplay() {
      if (this.limitOfAttenuation == null || isNaN(this.limitOfAttenuation)) return "";
      const v = this._convert("percentage", this.limitOfAttenuation, "pct");
      return Number.isFinite(v) ? v.toFixed(1) : "";
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

    // Strike temp is derived from the dough-in target; with no enabled rest it
    // is undefined/NaN, so render "—" rather than a stale/NaN readout.
    strikeWaterTempDisplay() {
      const f = this.mashField(N.strikeTemp);
      if (!f || typeof f.value !== "number" || !Number.isFinite(f.value)) return "";
      return f.display;
    },

    _materializeRests(rows) {
      const byId = new Map(rows.map((r) => [r.rest_id, r]));
      const order = [
        mash.DOUGH_IN_REST.rest_id,
        ...mash.CANONICAL_RESTS.map((r) => r.rest_id),
        mash.MASH_OUT_REST.rest_id,
      ];
      return order.map((id) => {
        const existing = byId.get(id);
        if (existing) return { ...existing };
        const isBookend = id === mash.DOUGH_IN_REST.rest_id || id === mash.MASH_OUT_REST.rest_id;
        return { rest_id: id, enabled: isBookend, use_temp_c: null, duration_min: null };
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
          : toBase(artifact, "temperature", ui.unitMode.temperature ?? "degC", Number(displayVal));
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
        return [mash.DOUGH_IN_REST, ...mash.CANONICAL_RESTS, mash.MASH_OUT_REST].map((def) => {
          const row = byId.get(def.rest_id);
          const isBookend =
            def.rest_id === mash.DOUGH_IN_REST.rest_id || def.rest_id === mash.MASH_OUT_REST.rest_id;
          return {
            ...def,
            enabled: row ? !!row.enabled : isBookend,
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
    hasOptionalRestsEnabled: {
      configurable: true,
      get() {
        return mash.hasOptionalRests(this.enabledMashRests);
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
        const unitId = ui.unitMode.temperature ?? "degC";
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
    limitOfAttenuation: {
      configurable: true,
      get() {
        return mash.estimateLimitOfAttenuation(this.mashRests);
      },
    },
    sortedMashDraftRests: {
      configurable: true,
      get() {
        return mash.sortRestsByTemperature(this.mashDraft).filter((r) => r.enabled);
      },
    },
    mashDraftDoughInTempC: {
      configurable: true,
      get() {
        let result;
        for (const r of this.sortedMashDraftRests) {
          if (r.rest_id === "dough_in") continue;
          if (typeof r.use_temp_c !== "number" || isNaN(r.use_temp_c)) continue;
          if (result === undefined || r.use_temp_c < result) result = r.use_temp_c;
        }
        return result;
      },
    },
    mashDraftDoughInDisplay: {
      configurable: true,
      get() {
        const v = this.mashDraftDoughInTempC;
        if (v == null) return "";
        const d = this._convert("temperature", v, "degC");
        return Number.isFinite(d) ? d.toFixed(1) : "";
      },
    },
    isMashDraftValid: {
      configurable: true,
      get() {
        return mash.isMashScheduleValid(this.sortedMashDraftRests, this.mashDraftDoughInTempC);
      },
    },
  });
}

export function refreshMashCard(app, ctx) {
  app.mashRests = ctx.engine.get(N.rests) ?? [];
}

export const KEYS = ["mashRests", "mashModalOpen", "mashDraft", "mashDraftDirty", "_convert", "restUseTempDisplay", "restTempRangeDisplay", "restBoundDisplay", "limitOfAttenuationDisplay", "getRestDefinition", "restName", "restPurpose", "isRestOutOfRange", "mashField", "strikeWaterTempDisplay", "_materializeRests", "_writeMashRests", "onMashPresetChange", "toggleMashRest", "openMashModal", "closeMashModal", "commitMashSchedule", "mashDraftRow", "setMashDraftTemp", "setMashDraftDuration", "mashPresetLabels", "mashPresetId", "canonicalMashRests", "sortedMashRests", "enabledMashRests", "hasOptionalRestsEnabled", "doughInInheritedTempC", "temperatureUnit", "doughInDisplay", "totalMashTimeMin", "limitOfAttenuation", "sortedMashDraftRests", "mashDraftDoughInTempC", "mashDraftDoughInDisplay", "isMashDraftValid"];
