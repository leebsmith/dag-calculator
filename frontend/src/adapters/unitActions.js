// Unit-preference actions: master menu picks, per-field overrides, reset, and
// device-local persistence. The factory receives an explicit view accessor so
// its methods never depend on Alpine's `this`.

import { UNIT_DIMENSIONS } from "../views/registry/units.js";
import { clearUnitMode, saveUnitMode } from "../store/unitPrefs.js";

// AI AGENT HOOKS: Use this installer for every unit-mode mutation and its
// persistence. Do not duplicate this logic elsewhere.
export function createUnitActions({ artifact, ui, getView }) {
  function applyUnitMode() {
    const view = getView();
    view.unitMode = { ...ui.unitMode };
    saveUnitMode(ui.unitMode, artifact.schema_version);
    view.compute();
  }

  function setUnit(dimension, unit) {
    if (unit) ui.unitMode[dimension] = unit;
    else delete ui.unitMode[dimension];
    applyUnitMode();
  }

  function resetUnits() {
    ui.unitMode = clearUnitMode();
    applyUnitMode();
  }

  function setFieldUnit(fieldId, unit) {
    if (unit) ui.unitMode[fieldId] = unit;
    else delete ui.unitMode[fieldId];
    applyUnitMode();
  }

  function toggleFieldUnit(field) {
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
    applyUnitMode();
  }

  function toggleUnits() {
    const view = getView();
    view.unitsOpen = !view.unitsOpen;
  }

  function closeUnits() {
    getView().unitsOpen = false;
  }

  return { setUnit, resetUnits, setFieldUnit, toggleFieldUnit, toggleUnits, closeUnits };
}

export function installUnitActions(app, dependencies = {}) {
  Object.assign(
    app,
    createUnitActions({ ...dependencies, getView: dependencies.getView ?? (() => app) })
  );
}

export const KEYS = ["setUnit", "setFieldUnit", "resetUnits", "toggleFieldUnit", "toggleUnits", "closeUnits"];
