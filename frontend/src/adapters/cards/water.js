// Water card: target selector, target-vs-actual grid, treatment summary, treated
// water against the target, telemetry audit log, and the mode-specific brew-day
// dosing instruction. The checked ion set is the constraint declaration; the
// solver strategy is derived from it. All readouts derive from declared outputs
// and roots — no engine path resolution leaks into the template. Node ids live
// in the registry (WATER_NODES).

import { fieldOr, formatQuantity, formatValue, formatWithDecimals } from "../../utils.js";
import {
  WATER_ION_BY_PIN,
  WATER_IONS,
  WATER_NODES as N,
  constraintLabel,
  constraintStatusFor,
  heldFromProfile,
  routeSummary,
  strategyForHeld,
  targetWarningFor,
  waterRegistry,
} from "../../views/registry/water.js";
import { ratioReadout } from "../../views/waterRatio.js";
import { reportError } from "../../observability.js";

const ION_KEYS = WATER_IONS.map((row) => row.ion);

const ADDITIONS = ["gypsum_kg", "cacl2_kg", "epsom_kg", "nacl_kg", "acid_l", "baking_soda_kg", "chalk_kg", "pickling_lime_kg"];

const AUTO_TARGET = "(Auto)";

export function kettleBlend(mash, hlt, runnings, sparge) {
  const total = runnings + sparge;
  if (!(total > 0)) return null;
  const out = {};
  for (const ion of ION_KEYS) {
    const m = mash?.[ion];
    const h = hlt?.[ion];
    if (typeof m !== "number" || typeof h !== "number") {
      out[ion] = null;
      continue;
    }
    out[ion] = (m * runnings + h * sparge) / total;
  }
  return out;
}

export function ionDelta(value, target) {
  if (typeof value !== "number" || typeof target !== "number") return null;
  return value - target;
}

function optionLabelFor(fieldId, value) {
  return waterRegistry[fieldId]?.optionLabels?.[value] ?? value;
}

function resolveValue(engine, path) {
  try {
    return engine.resolve(path);
  } catch {
    return undefined;
  }
}

function num(engine, path) {
  const v = resolveValue(engine, path);
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function ionVector(engine, prefix) {
  const out = {};
  for (const ion of ION_KEYS) out[ion] = num(engine, `${prefix}.${ion}`);
  return out;
}

function checkedPins(engine) {
  return (engine.get(N.pinnedIons) ?? []).map((row) => row.ion);
}

function targetValue(engine, pin) {
  const ion = WATER_ION_BY_PIN[pin];
  if (!ion) return 0;
  const value = resolveValue(engine, `${N.target}.${ion}`);
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

// Checked ions are always valued (checking seeds a number; clearing unchecks),
// so the constrained set and the checked set are the same set.
function valuedPins(engine) {
  return checkedPins(engine);
}

function doseRows(fieldsById, prefix, forms) {
  const names = {
    gypsum_kg: `gypsum (${forms.gypsum})`,
    cacl2_kg: `calcium chloride (${forms.cacl2})`,
    epsom_kg: "Epsom salt",
    nacl_kg: "table salt",
    acid_l: forms.acid,
    baking_soda_kg: "baking soda",
    chalk_kg: "chalk",
    pickling_lime_kg: "pickling lime",
  };
  const rows = [];
  let zero = 0;
  for (const key of ADDITIONS) {
    const field = fieldOr(fieldsById, `${prefix}.${key}`);
    if (typeof field.value !== "number") continue;
    if (field.value <= 0) {
      zero += 1;
      continue;
    }
    const shown = Number(field.display);
    if (Number.isFinite(shown) && shown === 0) {
      zero += 1;
      continue;
    }
    rows.push({ key, label: names[key], text: formatQuantity(field) });
  }
  return { rows, suppressed: zero > 0 && rows.length > 0 };
}

function fmtL(value) {
  return value == null ? "—" : `${formatValue(value)} L`;
}

function fmtPpm(value) {
  return value == null ? "—" : formatWithDecimals(value, 1, { dash: "—" });
}

function fmtDelta(value) {
  if (value == null) return "—";
  const text = formatWithDecimals(value, 1, { dash: "—" });
  return value > 0 ? `+${text}` : text;
}

function severityRank(severity) {
  return { ERROR: 3, WARNING: 2, NOTE: 1, INFO: 0 }[severity] ?? 0;
}

export function registerWaterCard(app, ctx) {
  const engine = ctx.engine;

  Object.assign(app, {
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

    toggleWaterDetails() {
      this.waterDetailsOpen = !this.waterDetailsOpen;
    },

    // Replace the target state in one atomic write: the preset's ions are
    // checked and filled, everything else is cleared.
    selectWaterTarget(value) {
      const preset =
        value !== "none" && value !== "freeform"
          ? ctx.cache.references.water_target?.[value]
          : null;
      const held = preset ? heldFromProfile(preset) : [];
      // A preset supplies the ion targets, the calcium floor, and the strategy
      // through artifact defaults: unset them so nothing from a previous profile
      // survives. Freeform/none have no component, so the host derives a
      // strategy from the checked set.
      this.resetWaterTargets();
      this.setRoot(N.targetProfileId, preset ? value : "");
      engine.setCollection(N.pinnedIons, held.map((ion) => ({ ion })));
      this.pickSelection(N.targetProfileId, preset ? value : "");
      this.waterTargetLocked = value === "none";
      if (!preset) this.setRoot(N.strategy, strategyForHeld(valuedPins(engine)));
      this.scheduleSolve();
      this.notify();
    },

    toggleWaterTarget(pin) {
      if (this.waterTargetLocked) return;
      const rows = engine.get(N.pinnedIons) ?? [];
      const checked = rows.some((row) => row.ion === pin);
      const next = checked ? rows.filter((row) => row.ion !== pin) : [...rows, { ion: pin }];
      engine.setCollection(N.pinnedIons, next);
      const nodeId = `${N.target}.${WATER_ION_BY_PIN[pin]}`;
      if (checked) {
        // Detaching keeps the profile's values as explicit overrides; the
        // unchecked ion then loses its target entirely.
        this.materializeWaterTargets();
        this.clearWaterPreset();
        this.unsetRoot(nodeId);
      } else {
        // Checked ions are always valued: seed from the batch's water source,
        // which is the only non-infeasible starting point (salts only add).
        const source = engine.identity?.[N.sourceReport] ?? {};
        const seed = Number(source[WATER_ION_BY_PIN[pin]]);
        this.setRoot(nodeId, Number.isFinite(seed) ? seed : 0);
        this.clearWaterPreset();
      }
      this.waterTargetLocked = false;
      this.setRoot(N.strategy, strategyForHeld(checkedPins(engine)));
      this.scheduleSolve();
      this.notify();
    },

    editWaterTarget(pin, raw) {
      if (!checkedPins(engine).includes(pin)) return;
      if (String(raw).trim() === "") {
        // A checked ion must carry a value; clearing the field unchecks it.
        this.toggleWaterTarget(pin);
        return;
      }
      const parsed = Number(raw);
      if (!Number.isFinite(parsed) || parsed < 0) return;
      this.writeWaterState({ [`${N.target}.${WATER_ION_BY_PIN[pin]}`]: parsed });
      this.setRoot(N.strategy, strategyForHeld(checkedPins(engine)));
      this.scheduleSolve();
      this.notify();
    },

    // Load-time normalisation: legacy drafts carry values but no checked set,
    // and possibly a stale AUTO strategy. Seed the set from positive targets
    // and write the derived strategy. Returns true when anything changed.
    syncWaterTargets() {
      let changed = false;
      let pins = checkedPins(engine);
      if (pins.length === 0) {
        const positives = WATER_IONS.filter(({ pin }) => targetValue(engine, pin) > 0).map(
          ({ pin }) => pin
        );
        if (positives.length > 0) {
          engine.setCollection(N.pinnedIons, positives.map((ion) => ({ ion })));
          pins = positives;
          changed = true;
        }
      }
      this.waterTargetLocked = !engine.get(N.targetProfileId) && pins.length === 0;
      const strategy = strategyForHeld(valuedPins(engine));
      if (engine.get(N.strategy) !== strategy) {
        this.master.setRoot(N.strategy, strategy);
        engine.setRoot(N.strategy, strategy);
        changed = true;
      }
      return changed;
    },

    // Drop every inherited target so the selected profile (or absence) supplies
    // the values again.
    resetWaterTargets() {
      for (const { ion } of WATER_IONS) this.unsetRoot(`${N.target}.${ion}`);
      this.unsetRoot(N.calciumFloor);
      this.unsetRoot(N.strategy);
    },

    // Convert inherited targets into explicit overrides, so clearing the profile
    // keeps the current numbers editable instead of dropping them.
    materializeWaterTargets() {
      const entries = {};
      for (const { ion } of WATER_IONS) {
        const value = engine.get(`${N.target}.${ion}`);
        if (value !== undefined && value !== null) entries[`${N.target}.${ion}`] = value;
      }
      const floor = engine.get(N.calciumFloor);
      if (floor !== undefined && floor !== null) entries[N.calciumFloor] = floor;
      this.writeWaterState(entries);
    },

    // Direct root writes for batch actions; the caller ends with one setRoot on
    // the derived strategy so exactly one solve is scheduled.
    writeWaterState(entries) {
      for (const [nodeId, value] of Object.entries(entries)) {
        this.master.setRoot(nodeId, value);
        engine.setRoot(nodeId, value);
      }
    },

    // Any manual change to the checked set detaches the preset.
    clearWaterPreset() {
      if (!engine.get(N.targetProfileId)) return;
      this.writeWaterState({ [N.targetProfileId]: "" });
      this.pickSelection(N.targetProfileId, "");
    },

    waterInstruction(stepId) {
      const s = this.waterSummary;
      if (stepId === "dough-in") return s.instructionDoughIn ?? "";
      if (stepId === "batch-sparge") return s.instructionSparge ?? "";
      if (stepId === "brew-day-setup") return s.instructionSetup ?? "";
      return "";
    },

    telemetryLine(t) {
      return `[${t?.severity ?? ""}] ${t?.message ?? ""}`;
    },

    telemetryClass(t) {
      return `sev-${(t?.severity ?? "").toLowerCase()}`;
    },
  });

  Object.defineProperties(app, {
    waterTargetOptions: {
      configurable: true,
      get() {
        const records = ctx.cache.references.water_target ?? {};
        const presets = Object.entries(records)
          .map(([id, profile]) => {
            const held = heldFromProfile(profile);
            return {
              value: id,
              label: `${constraintLabel(held)} — ${profile?.name ?? id}`,
              size: held.length,
            };
          })
          .filter((option) => option.size > 0)
          .sort((a, b) => a.size - b.size || a.label.localeCompare(b.label));
        return [
          { value: "none", label: "No targets — no ion targets" },
          ...presets.map(({ value, label }) => ({ value, label })),
          { value: "freeform", label: "Freeform entry — compose your own set" },
        ];
      },
    },
    waterTargetSelection: {
      configurable: true,
      get() {
        const id = engine.get(N.targetProfileId) ?? "";
        if (id) {
          return this.waterTargetOptions.some((option) => option.value === id) ? id : "freeform";
        }
        return this.waterTargetLocked ? "none" : "freeform";
      },
    },
  });
}

export function refreshWaterCard(app, ctx) {
  const engine = ctx.engine;
  try {
    const proportional = engine.get(N.saltDistribution) === "PROPORTIONAL";
    const strike = num(engine, N.vMashTreat);
    const doseVolume = num(engine, N.spargeSaltedVolume);
    const deliveredSparge = num(engine, N.vSpargeDeliverable);
    const run1 = num(engine, N.vRun1) ?? 0;
    const run2 = num(engine, N.vRun2) ?? 0;
    const sparge = num(engine, N.vSparge) ?? 0;

    const gypsum = optionLabelFor(N.gypsumForm, engine.get(N.gypsumForm));
    const cacl2 = optionLabelFor(N.cacl2Form, engine.get(N.cacl2Form));
    const acid = optionLabelFor(N.acidMedium, engine.get(N.acidMedium));
    const gypsumForm = engine.get(N.gypsumForm);
    const cacl2Form = engine.get(N.cacl2Form);
    const forms = {
      gypsum: gypsumForm === "GYPSUM_ANHYDROUS" ? "anhydrous" : "dihydrate",
      cacl2: cacl2Form === "CACL2_ANHYDROUS" ? "anhydrous" : "dihydrate",
      acid,
    };

    const mashIons = ionVector(engine, N.postMashIons);
    const hltIons = ionVector(engine, N.postHltIons);
    const kettle = kettleBlend(mashIons, hltIons, run1 + run2, sparge);

    // The checked set is the declaration and every checked ion carries a value.
    // The strategy is derived from that set.
    const checked = checkedPins(engine);
    const checkedSet = new Set(checked);
    const valued = valuedPins(engine);
    const valuedSet = new Set(valued);
    const stored = engine.get(N.strategy) ?? "";
    const effectiveMode = !stored || stored === "AUTO" ? strategyForHeld(valued) : stored;
    const resolvedMode = resolveValue(engine, N.resolvedStrategy) ?? effectiveMode;

    // The target ratio is only a comparison basis when both flavor ions are
    // constrained; otherwise the readout stays as-solved only.
    const flavorConstrained = valuedSet.has("so4") && valuedSet.has("cl");
    const ratio = ratioReadout(kettle, flavorConstrained ? ionVector(engine, N.target) : null);
    const ratioBasis = proportional
      ? "Kettle ratio — split mode: same concentration in both vessels."
      : "Kettle ratio — sparge untreated, acid only.";
    const ratioLine =
      ratio.targetText && ratio.deltaFactorText
        ? `${ratio.targetText} target → ${ratio.asSolvedText} kettle, ${ratio.deltaFactorText}`
        : ratio.asSolvedText;
    const ions = WATER_IONS.map(({ ion, pin, label, source }) => {
      const sourceVal = num(engine, `${N.sourceReport}.${source}`);
      const targetVal = num(engine, `${N.target}.${ion}`);
      const postDoseVal = num(engine, `${N.postDoseIons}.${ion}`);
      const isChecked = checkedSet.has(pin);
      const isValued = valuedSet.has(pin) && typeof targetVal === "number";
      const below = isValued && typeof sourceVal === "number" && targetVal < sourceVal;
      let status = "Auto";
      if (isChecked) status = isValued ? constraintStatusFor(effectiveMode, pin) : "No value";
      return {
        ion,
        pin,
        label,
        checkboxLabel: `Target ${label}`,
        inputLabel: `${label} target (ppm)`,
        checked: isChecked,
        targetValue: typeof targetVal === "number" ? targetVal : 0,
        valueText: isValued ? fmtPpm(targetVal) : AUTO_TARGET,
        sourceText: fmtPpm(sourceVal),
        postDoseText: fmtPpm(postDoseVal),
        deltaText: isValued ? fmtDelta(ionDelta(postDoseVal, targetVal)) : "—",
        status,
        hint: isChecked && !isValued ? "no target entered" : below ? "below source" : "",
      };
    });

    const notes = [];
    const surplus = num(engine, N.surplusSpargeCapacity);
    if (surplus != null && surplus > 0) {
      notes.push(`HLT holds ${fmtL(surplus)} more than the sparge delivers.`);
    }
    const residualHlt = num(engine, N.residualHlt);

    const mashDoses = doseRows(app.fieldsById, N.mashAdditions, forms);
    const spargeDoses = doseRows(app.fieldsById, N.spargeAdditions, forms);
    const mashDoseText = mashDoses.rows.map((d) => `${d.label} ${d.text}`.trim()).join(", ");
    const spargeDoseText = spargeDoses.rows.map((d) => `${d.label} ${d.text}`.trim()).join(", ");
    const hltStart = num(engine, N.hltStart);
    const basis = `Masses assume ${gypsum} · ${cacl2} · ${acid}`;
    const notModelled =
      "Not modelled: grist ions and metabisulfite (≤ ~8 mg/L SO₄ per tablet/15 US gal; ~15 mg/L in a 30 L HLT).";
    const targetLine = routeSummary(valued);
    const targetWarning = targetWarningFor(valued);

    const instructionSetup =
      `Fill the HLT to ${fmtL(hltStart)}. Add 1 crushed metabisulfite tablet per 15 US gal. ` +
      `Water and metabisulfite only — no salts or acid yet. ${basis}. ` +
      `(SMB is not modelled: ≤ ~8 mg/L SO₄ per tablet/15 US gal, ~15 mg/L in a 30 L HLT.)`;
    const instructionDoughIn = mashDoseText
      ? `Dose the dry grist before underletting: ${mashDoseText}. Sized for the ${fmtL(strike)} strike.`
      : `Dose the dry grist before underletting: no additions. Sized for the ${fmtL(strike)} strike.`;
    const instructionSparge = proportional
      ? `After the strike is drawn and the HLT is topped up to ${fmtL(doseVolume)}: add ${spargeDoseText || "nothing"} to the HLT. ` +
        `Stir to dissolve, then underlet. ${fmtL(deliveredSparge)} ships; the remainder is dead space and transfer loss.`
      : `After the strike is drawn and the HLT is topped up to ${fmtL(doseVolume)}: no salts in the HLT. ` +
        `${spargeDoseText ? `Add ${spargeDoseText} only.` : "No additions — underlet with untreated water."} ${fmtL(deliveredSparge)} ships.`;

    const telemetry = (app.waterTelemetry?.telemetry ?? []).slice();
    telemetry.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
    const warningCount = telemetry.filter(
      (t) => t?.severity === "WARNING" || t?.severity === "ERROR"
    ).length;

    const predictedField = fieldOr(app.fieldsById, N.predictedPh);
    const statusField = fieldOr(app.fieldsById, N.phStatus);
    const doseVolumeField = fieldOr(app.fieldsById, N.vHltTreat);
    const residualField = fieldOr(app.fieldsById, N.residualHlt);

    const sourceComponent = engine.identity?.[N.sourceReport] ?? {};
    app.waterPlan = {
      source: {
        id: N.sourceReport,
        label: "Source report",
        value: sourceComponent.report_id ?? "",
        options: [],
        optionLabels: {},
        hint: sourceComponent.laboratory || "Fixed by the batch identity",
        editable: false,
        target: null,
      },
      target: fieldOr(app.fieldsById, N.targetProfileId),
      floor: fieldOr(app.fieldsById, N.calciumFloor),
      mashPh: fieldOr(app.fieldsById, N.targetMashPh),
    };
    app.waterTreatmentFields = [
      N.saltDistribution,
      N.acidMedium,
      N.gypsumForm,
      N.cacl2Form,
      N.alkalineAgent,
    ]
      .map((id) => fieldOr(app.fieldsById, id))
      .filter((field) => field.id);

    app.waterVerdict = {
      targetLine,
      ratioLine,
      predictedPh: predictedField.display || "—",
      status: statusField.display || "",
    };

    const spargeAcid = spargeDoses.rows.find((dose) => dose.key === "acid_l");

    app.waterPrescription = {
      doseVolumeText: formatQuantity(doseVolumeField),
      residualText: formatQuantity(residualField),
      mash: mashDoses.rows,
      sparge: spargeDoses.rows,
      suppressed: mashDoses.suppressed || spargeDoses.suppressed,
      spargeAcidPrescribed: Boolean(spargeAcid),
      pending: Boolean(app.boundaryPending),
      basis,
      destinations: "Mash → dry grist, before underletting · Sparge → HLT after top-up",
    };

    app.waterDetails = {
      telemetry,
      ratioBasis,
      notModelled,
      boundaryStatus: app.boundaryStatuses?.[N.waterBoundary] ?? "ok",
      error: app.boundaryError ?? null,
    };

    app.waterWarningCount = warningCount;

    app.waterSummary = {
      mode: effectiveMode,
      resolvedMode,
      targetLine,
      targetWarning,
      proportional,
      basis,
      mashDose: mashDoses.rows,
      spargeDose: spargeDoses.rows,
      doseVolume,
      deliveredSparge,
      ions,
      checkedPins: checked,
      valuedPins: valued,
      notes,
      residualHlt,
      notModelled,
      ratio,
      ratioBasis,
      ratioLine,
      telemetry,
      warningCount,
      warningLabel: warningCount === 1 ? "1 warning" : `${warningCount} warnings`,
      instructionSetup,
      instructionDoughIn,
      instructionSparge,
    };
  } catch (err) {
    reportError("waterCard.refresh", err);
    app.waterSummary = { ...app.waterSummary, notes: [], telemetry: [] };
  }
}

export const KEYS = [
  "waterSummary",
  "waterTargetLocked",
  "waterDetailsOpen",
  "waterPlan",
  "waterTreatmentFields",
  "waterPrescription",
  "waterVerdict",
  "waterDetails",
  "waterWarningCount",
  "toggleWaterDetails",
  "waterTargetOptions",
  "waterTargetSelection",
  "selectWaterTarget",
  "toggleWaterTarget",
  "editWaterTarget",
  "syncWaterTargets",
  "writeWaterState",
  "clearWaterPreset",
  "waterInstruction",
  "telemetryLine",
  "telemetryClass",
  "resetWaterTargets",
  "materializeWaterTargets",
];
