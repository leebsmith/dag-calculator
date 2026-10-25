// Unit-preference actions: master menu picks, per-field overrides, reset, and
// device-local persistence. App methods stay thin delegates to this module.

import { UNIT_DIMENSIONS } from "../views/registry/units.js";
import { clearUnitMode, saveUnitMode } from "../store/unitPrefs.js";

// AI AGENT HOOKS: Use this installer for every unit-mode mutation and its
// persistence. Do not duplicated this logic elsewhere.
export function installUnitActions(app, { artifact, ui }) {
  Object.assign(app, {
    setUnit(dimension, unit) {
      if (unit) ui.unitMode[dimension] = unit;
      else delete ui.unitMode[dimension];
      this.unitMode = { ...ui.unitMode };
      saveUnitMode(ui.unitMode, artifact.schema_version);
      this.compute();
    },

    // Clear every stored unit preference (master picks + per-field overrides,
    // including invisible ones on summary readouts) and revert to defaults.
    resetUnits() {
      ui.unitMode = clearUnitMode();
      this.unitMode = { ...ui.unitMode };
      this.compute();
    },

    setFieldUnit(fieldId, unit) {
      if (unit) ui.unitMode[fieldId] = unit;
      else delete ui.unitMode[fieldId];
      this.unitMode = { ...ui.unitMode };
      saveUnitMode(ui.unitMode, artifact.schema_version);
      this.compute();
    },

    // Per-field unit override: cycle the field through its dimension's units,
    // dropping the override when it lands back on the field's inherited unit
    // (the pinned registry `displayUnit`, else the master menu pick, else base).
    toggleFieldUnit(field) {
      const dim = field.dimension;
      if (!dim) return;
      const dimDef = UNIT_DIMENSIONS.find((d) => d.id === dim);
      if (!dimDef) return;
      const units = dimDef.units.map(([id]) => id);
      const fieldDefault = field.displayUnit ?? ui.unitMode[dim] ?? dimDef.default ?? units[0];
      const current = ui.unitMode[field.id] ?? fieldDefault;
      const next = units[(units.indexOf(current) + 1) % units.length];
      if (next === fieldDefault) delete ui.unitMode[field.id];
      else ui.unitMode[field.id] = next;
      this.unitMode = { ...ui.unitMode };
      saveUnitMode(ui.unitMode, artifact.schema_version);
      this.compute();
    },

    toggleUnits() {
      this.unitsOpen = !this.unitsOpen;
    },

    closeUnits() {
      this.unitsOpen = false;
    },
  });
}

export const KEYS = ["setUnit", "setFieldUnit", "resetUnits", "toggleFieldUnit", "toggleUnits", "closeUnits"];
