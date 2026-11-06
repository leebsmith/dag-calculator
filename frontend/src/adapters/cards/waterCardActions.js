// Water card actions and getters: target selection, the checked-ion set, the
// field-input seams, and the target-preset mirrors. The refresh readouts stay in
// water.js; every handler resolves the live view through the injected getView.

import {
  WATER_ION_BY_PIN,
  WATER_IONS,
  WATER_NODES as N,
  heldFromProfile,
  strategyForHeld,
} from "../../views/registry/water.js";
import { ignoreError } from "../../observability.js";

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

export function checkedPins(engine) {
  return (engine.get(N.pinnedIons) ?? []).map((row) => row.ion);
}

export function targetValue(engine, pin, reportError = ignoreError) {
  const ion = WATER_ION_BY_PIN[pin];
  if (!ion) return 0;
  const value = resolveValue(engine, `${N.target}.${ion}`, reportError);
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

// Checked ions are always valued (checking seeds a number; clearing unchecks),
// so the constrained set and the checked set are the same set.
export function valuedPins(engine) {
  return checkedPins(engine);
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

    waterTargetLocked: false,

    waterDetailsOpen: false,

    waterPlan: {
      source: {},
      target: {},
      floor: {},
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
      const held = preset ? heldFromProfile(preset) : [];
      // A preset supplies the ion targets, the calcium floor, and the strategy
      // through artifact defaults: unset them so nothing from a previous profile
      // survives. Freeform/none have no component, so the host derives a
      // strategy from the checked set.
      view.resetWaterTargets();
      view.setRoot(N.targetProfileId, preset ? value : "");
      engine.setCollection(N.pinnedIons, held.map((ion) => ({ ion })));
      view.pickSelection(N.targetProfileId, preset ? value : "");
      view.waterTargetLocked = value === "none";
      if (!preset) view.setRoot(N.strategy, strategyForHeld(valuedPins(engine)));
      view.scheduleSolve();
      view.notify();
    },

    toggleWaterTarget(pin) {
      const view = getView();
      if (view.waterTargetLocked) return;
      const rows = engine.get(N.pinnedIons) ?? [];
      const checked = rows.some((row) => row.ion === pin);
      const next = checked ? rows.filter((row) => row.ion !== pin) : [...rows, { ion: pin }];
      engine.setCollection(N.pinnedIons, next);
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
        const source = engine.identity?.[N.sourceReport] ?? {};
        const seed = Number(source[WATER_ION_BY_PIN[pin]]);
        view.setRoot(nodeId, Number.isFinite(seed) ? seed : 0);
        view.clearWaterPreset();
      }
      view.waterTargetLocked = false;
      view.setRoot(N.strategy, strategyForHeld(checkedPins(engine)));
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
      if (!checkedPins(engine).includes(pin)) return;
      if (String(raw).trim() === "") {
        // A checked ion must carry a value; clearing the field unchecks it.
        view.toggleWaterTarget(pin);
        return;
      }
      const parsed = Number(raw);
      if (!Number.isFinite(parsed) || parsed < 0) return;
      view.writeWaterState({ [`${N.target}.${WATER_ION_BY_PIN[pin]}`]: parsed });
      view.setRoot(N.strategy, strategyForHeld(checkedPins(engine)));
      view.scheduleSolve();
      view.notify();
    },
  };
}

function syncActions({ engine, getView, observability }) {
  return {
    // Load-time normalisation: legacy drafts carry values but no checked set,
    // and possibly a stale AUTO strategy. Seed the set from positive targets
    // and write the derived strategy. Returns true when anything changed.
    syncWaterTargets() {
      const view = getView();
      let changed = false;
      let pins = checkedPins(engine);
      if (pins.length === 0) {
        const positives = WATER_IONS.filter(
          ({ pin }) => targetValue(engine, pin, observability.reportError) > 0
        ).map(
          ({ pin }) => pin
        );
        if (positives.length > 0) {
          engine.setCollection(N.pinnedIons, positives.map((ion) => ({ ion })));
          pins = positives;
          changed = true;
        }
      }
      view.waterTargetLocked = !engine.get(N.targetProfileId) && pins.length === 0;
      const strategy = strategyForHeld(valuedPins(engine));
      if (engine.get(N.strategy) !== strategy) {
        engine.setRoot(N.strategy, strategy);
        changed = true;
      }
      return changed;
    },

    // Drop every inherited target so the selected profile (or absence) supplies
    // the values again.
    resetWaterTargets() {
      const view = getView();
      for (const { ion } of WATER_IONS) view.unsetRoot(`${N.target}.${ion}`);
      view.unsetRoot(N.calciumFloor);
      view.unsetRoot(N.strategy);
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
        return view.waterTargetLocked ? "none" : "freeform";
      },
    },
  };
}
