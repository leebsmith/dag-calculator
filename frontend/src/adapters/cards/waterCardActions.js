// Water card actions and getters: target selection, the checked-ion set, the
// field-input seams, and the target-preset mirrors. The refresh readouts stay in
// water.js; every handler resolves the live view through the injected getView.

import {
  WATER_ION_BY_PIN,
  WATER_IONS,
  WATER_NODES as N,
} from "../../views/registry/water.js";
import { ignoreError } from "../../observability.js";
import {
  checkedPins,
  nextPinned,
  pinnedRows,
  presetPins,
  seedTargetValue,
} from "../../views/waterLogic.js";

// These read helpers keep a silent default for direct unit tests; the water
// card passes the app reporter.
export function resolveValue(engine, path, reportError = ignoreError) {
  try {
    return engine.resolve(path);
  } catch (err) {
    reportError("waterCard.resolve", err);
    return undefined;
  }
}

export function num(engine, path, reportError = ignoreError) {
  const v = resolveValue(engine, path, reportError);
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function initialState() {
  return {
    waterSummary: {
      mode: "",
      resolvedMode: "",
      targetLine: "",
      proportional: false,
      basis: "",
      mashDose: [],
      spargeDose: [],
      doseVolume: null,
      deliveredSparge: null,
      ions: [],
      checkedPins: [],
      valuedPins: [],
      notes: [],
      residualHlt: null,
      notModelled: "",
      telemetry: [],
      warningCount: 0,
      warningLabel: "0 warnings",
    },

    waterDetailsOpen: false,

    waterPlan: {
      source: {},
      target: {},
      floor: {},
      ceiling: {},
      floorNotice: "",
      mashPh: {},
    },

    waterTreatmentFields: [],

    waterPrescription: {
      doseVolumeText: "—",
      residualText: "—",
      mash: [],
      sparge: [],
      suppressed: false,
      spargeAcidPrescribed: false,
      pending: false,
      basis: "",
      destinations: "Mash → dry grist, before underletting · Sparge → HLT after top-up",
    },

    waterVerdict: {
      targetLine: "",
      ratioLine: "",
      phLine: "",
      predictedPh: "—",
      status: "",
    },

    waterDetails: {
      telemetry: [],
      ratioBasis: "",
      notModelled: "",
      boundaryStatus: "ok",
      error: null,
    },

    waterWarningCount: 0,
  };
}

function detailsActions({ getView }) {
  return {
    toggleWaterDetails() {
      const view = getView();
      view.waterDetailsOpen = !view.waterDetailsOpen;
    },

    waterInstruction(stepId) {
      const summary = getView().waterSummary;
      if (stepId === "dough-in") return summary.instructionDoughIn ?? "";
      if (stepId === "batch-sparge") return summary.instructionSparge ?? "";
      if (stepId === "brew-day-setup") return summary.instructionSetup ?? "";
      return "";
    },

    telemetryLine(t) {
      return `[${t?.severity ?? ""}] ${t?.message ?? ""}`;
    },

    telemetryClass(t) {
      return `sev-${(t?.severity ?? "").toLowerCase()}`;
    },
  };
}

function targetActions({ cache, engine, getView }) {
  return {
    // Replace the target state in one atomic write: the preset's ions are
    // checked and filled, everything else is cleared.
    selectWaterTarget(value) {
      const view = getView();
      const preset =
        value !== "none" && value !== "freeform"
          ? cache.references.water_target?.[value]
          : null;
      const held = presetPins(preset);
      // A preset supplies the ion targets, the calcium floor, and the strategy
      // through artifact defaults: unset them so nothing from a previous profile
      // survives. Freeform/none have no component, so the host derives a
      // strategy from the checked set.
      view.resetWaterTargets();
      view.setRoot(N.targetProfileId, preset ? value : "");
      engine.setCollection(N.pinnedIons, pinnedRows(held));
      view.pickSelection(N.targetProfileId, preset ? value : "");
      view.scheduleSolve();
      view.notify();
    },

    toggleWaterTarget(pin) {
      const view = getView();
      const rows = engine.get(N.pinnedIons) ?? [];
      const checked = rows.some((row) => row.ion === pin);
      engine.setCollection(N.pinnedIons, nextPinned(rows, pin));
      const nodeId = `${N.target}.${WATER_ION_BY_PIN[pin]}`;
      if (checked) {
        // Detaching keeps the profile's values as explicit overrides; the
        // unchecked ion then loses its target entirely.
        view.materializeWaterTargets();
        view.clearWaterPreset();
        view.unsetRoot(nodeId);
      } else {
        // Checked ions are always valued: seed from the batch's water source,
        // which is the only non-infeasible starting point (salts only add).
        // Materialize the other checked ions first: detaching the preset must
        // not drop values they still inherit from it.
        view.materializeWaterTargets();
        view.setRoot(nodeId, seedTargetValue(engine.identity?.[N.sourceReport], pin));
        view.clearWaterPreset();
      }
      view.scheduleSolve();
      view.notify();
    },
  };
}

function inputActions({ engine, getView }) {
  return {
    editWaterNumber(key, field, raw) {
      const view = getView();
      view.setInputDraft(key, raw);
      view.edit(field, raw);
    },

    commitWaterNumber(key, field) {
      const view = getView();
      view.clearInputDraft(key);
      view.commitField(field);
      view.notify();
    },

    editWaterTargetInput(pin, raw) {
      const view = getView();
      view.setInputDraft(view.inputKey("ion", pin), raw);
      view.editWaterTarget(pin, raw);
    },

    commitWaterTargetInput(pin) {
      const view = getView();
      view.clearInputDraft(view.inputKey("ion", pin));
      view.notify();
    },

    editWaterTarget(pin, raw) {
      const view = getView();
      if (!checkedPins(engine.get(N.pinnedIons)).includes(pin)) return;
      if (String(raw).trim() === "") {
        // A checked ion must carry a value; clearing the field unchecks it.
        view.toggleWaterTarget(pin);
        return;
      }
      const parsed = Number(raw);
      if (!Number.isFinite(parsed) || parsed < 0) return;
      view.writeWaterState({ [`${N.target}.${WATER_ION_BY_PIN[pin]}`]: parsed });
      view.scheduleSolve();
      view.notify();
    },
  };
}

function syncActions({ engine, getView }) {
  return {
    // Load-time normalisation for a legacy draft: a selected profile with no
    // objective set seeds the set from the profile's declared ions. Values alone
    // never imply an objective — the checked set is the declaration.
    syncWaterTargets() {
      if (checkedPins(engine.get(N.pinnedIons)).length > 0) return false;
      if (!engine.get(N.targetProfileId)) return false;
      const held = presetPins(engine.get(N.targetProfile));
      if (held.length === 0) return false;
      engine.setCollection(N.pinnedIons, pinnedRows(held));
      return true;
    },

    // Drop every inherited target so the selected profile (or absence) supplies
    // the values again.
    resetWaterTargets() {
      const view = getView();
      for (const { ion } of WATER_IONS) view.unsetRoot(`${N.target}.${ion}`);
      view.unsetRoot(N.calciumFloor);
      view.unsetRoot(N.calciumCeiling);
    },

    resetWaterField(field) {
      const nodeId = field?.target?.nodeId;
      if (!nodeId) return;
      const view = getView();
      view.unsetRoot(nodeId);
      view.scheduleSolve();
      view.notify();
    },

    // Convert inherited targets into explicit overrides, so clearing the profile
    // keeps the current numbers editable instead of dropping them.
    materializeWaterTargets() {
      const view = getView();
      const entries = {};
      for (const { ion } of WATER_IONS) {
        const value = engine.get(`${N.target}.${ion}`);
        if (value !== undefined && value !== null) entries[`${N.target}.${ion}`] = value;
      }
      const floor = engine.get(N.calciumFloor);
      if (floor !== undefined && floor !== null) entries[N.calciumFloor] = floor;
      view.writeWaterState(entries);
    },

    // Direct root writes for batch actions; the caller ends with one setRoot on
    // the derived strategy so exactly one solve is scheduled.
    writeWaterState(entries) {
      for (const [nodeId, value] of Object.entries(entries)) {
        engine.setRoot(nodeId, value);
      }
    },

    // Any manual change to the checked set detaches the preset.
    clearWaterPreset() {
      const view = getView();
      if (!engine.get(N.targetProfileId)) return;
      view.writeWaterState({ [N.targetProfileId]: "" });
      view.pickSelection(N.targetProfileId, "");
    },
  };
}

export function waterActions(ctx) {
  return {
    ...initialState(),
    ...detailsActions(ctx),
    ...targetActions(ctx),
    ...inputActions(ctx),
    ...syncActions(ctx),
  };
}

export function waterDescriptors({ getView }) {
  return {
    waterTargetOptionsState: { configurable: true, writable: true, value: null },
    waterTargetProfileId: { configurable: true, writable: true, value: null },
    waterTargetOptions: {
      configurable: true,
      get() {
        return getView().waterTargetOptionsState ?? [];
      },
    },
    waterTargetSelection: {
      configurable: true,
      get() {
        const view = getView();
        const id = view.waterTargetProfileId ?? "";
        if (id) {
          return view.waterTargetOptions.some((option) => option.value === id) ? id : "freeform";
        }
        return view.waterSummary.checkedPins.length === 0 ? "none" : "freeform";
      },
    },
  };
}
