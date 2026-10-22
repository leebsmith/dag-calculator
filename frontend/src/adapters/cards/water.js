// Water card: mode selector, target-vs-actual grid, treatment summary, treated
// water against the target, telemetry audit log, and the mode-specific brew-day
// dosing instruction. All readouts derive from declared outputs and roots — no
// engine path resolution leaks into the template. Node ids live in the registry
// (WATER_NODES).

import { fieldOr, formatQuantity, formatValue } from "../../utils.js";
import {
  WATER_IONS,
  WATER_NODES as N,
  constraintStatusFor,
  pinnedIonsFor,
  waterRegistry,
} from "../../views/registry/water.js";
import { ratioReadout } from "../../views/waterRatio.js";
import { reportError } from "../../observability.js";

const ION_KEYS = WATER_IONS.map((row) => row.ion);

const ADDITIONS = ["gypsum_kg", "cacl2_kg", "epsom_kg", "nacl_kg", "acid_l", "baking_soda_kg", "chalk_kg", "pickling_lime_kg"];

const WATER_MODES = [
  { id: "CALCIUM_FLOOR", label: "Flavor Balance (SO₄ / Cl)" },
  { id: "HYBRID", label: "Ratio + Dark Beer Buffer (SO₄ / Cl + Alk)" },
  { id: "OPTIMIZE", label: "Classic Clone (all 6 ions)" },
  { id: "BASELINE", label: "Baseline (no targets)" },
  { id: "CUSTOM", label: "Custom Permutation" },
];

const AUTO_TARGET = "(Auto)";

// Salts are five levers; four pins keep one degree of freedom so mass
// minimisation still has a choice to make.
const WATER_PIN_LIMIT = 4;

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

function num(engine, path) {
  const v = engine.resolve(path);
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function ionVector(engine, prefix) {
  const out = {};
  for (const ion of ION_KEYS) out[ion] = num(engine, `${prefix}.${ion}`);
  return out;
}

function doseList(fieldsById, prefix, vessel, forms) {
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
  for (const key of ADDITIONS) {
    const field = fieldOr(fieldsById, `${prefix}.${key}`);
    if (typeof field.value !== "number" || field.value <= 0) continue;
    rows.push({ label: `${vessel} ${names[key]}`, text: formatQuantity(field) });
  }
  return rows;
}

function fmtL(value) {
  return value == null ? "—" : `${formatValue(value)} L`;
}

function fmtPpm(value) {
  return value == null ? "—" : formatValue(value);
}

function fmtDelta(value) {
  if (value == null) return "—";
  return (value > 0 ? "+" : "") + formatValue(value);
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
      proportional: false,
      basis: "",
      mashDose: [],
      spargeDose: [],
      doseVolume: null,
      deliveredSparge: null,
      ions: [],
      notes: [],
      tanninWarning: false,
      residualHlt: null,
      notModelled: "",
      telemetry: [],
    },

    waterModes: WATER_MODES,
    waterModeLabel: "",
    waterPinModalOpen: false,
    waterPinOptions: [
      { ion: "ca", label: "Calcium (Ca²⁺)" },
      { ion: "mg", label: "Magnesium (Mg²⁺)" },
      { ion: "na", label: "Sodium (Na⁺)" },
      { ion: "so4", label: "Sulfate (SO₄²⁻)" },
      { ion: "cl", label: "Chloride (Cl⁻)" },
      { ion: "alk", label: "Alkalinity (as CaCO₃)" },
    ],

    setWaterMode(mode) {
      this.waterSummary.mode = mode;
      this.setRoot(N.strategy, mode);
      this.scheduleSolve();
      this.notify();
    },

    openWaterPinModal() {
      this.waterPinModalOpen = true;
    },

    closeWaterPinModal() {
      this.waterPinModalOpen = false;
    },

    waterPinChecked(ion) {
      return (this.waterSummary.pinnedIons ?? []).includes(ion);
    },

    waterPinDisabled(ion) {
      const rows = engine.get(N.pinnedIons) ?? [];
      return !rows.some((r) => r.ion === ion) && rows.length >= WATER_PIN_LIMIT;
    },

    toggleWaterPin(ion) {
      const rows = engine.get(N.pinnedIons) ?? [];
      const pinned = rows.some((r) => r.ion === ion);
      if (pinned && rows.length === 1) return;
      if (!pinned && rows.length >= WATER_PIN_LIMIT) return;
      const next = pinned ? rows.filter((r) => r.ion !== ion) : [...rows, { ion }];
      engine.setCollection(N.pinnedIons, next);
      this.waterSummary.pinnedIons = next.map((r) => r.ion);
      this.scheduleSolve();
      this.notify();
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

    waterModeBanner() {
      const m = this.waterSummary.resolvedMode;
      return m ? `Routed: ${m}` : "";
    },
  });
}

export function refreshWaterCard(app, ctx) {
  const engine = ctx.engine;
  try {
    const mode = engine.get(N.strategy) ?? "";
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
    const ratio = ratioReadout(
      kettle,
      engine.get(N.sulfateChlorideMode),
      num(engine, N.sulfateChlorideRatio)
    );
    const ratioBasis = proportional
      ? "Kettle ratio — split mode: same concentration in both vessels."
      : "Kettle ratio — sparge untreated, acid only.";
    const ratioLine = ratio.intentText
      ? `${ratio.intentText} intent → ${ratio.asSolvedText} kettle, ${ratio.deltaFactorText}`
      : ratio.asSolvedText;

    // Target-vs-actual grid: source (read-only report), target (editable roots),
    // post-dose (salts + agent + acid), signed delta, and a pin/floating status.
    const resolvedMode = engine.resolve(N.resolvedStrategy) ?? mode;
    const effectiveMode = mode === "AUTO" ? resolvedMode : mode;
    const customPins = (engine.get(N.pinnedIons) ?? []).map((r) => r.ion);
    const pinned = pinnedIonsFor(effectiveMode, customPins);
    const ions = WATER_IONS.map(({ ion, pin, label, source }) => {
      const sourceVal = num(engine, `${N.sourceReport}.${source}`);
      const targetVal = num(engine, `${N.target}.${ion}`);
      const postDoseVal = num(engine, `${N.postDoseIons}.${ion}`);
      const isPinned = pinned.has(pin);
      return {
        ion,
        label,
        sourceText: fmtPpm(sourceVal),
        targetText: isPinned ? fmtPpm(targetVal) : AUTO_TARGET,
        postDoseText: fmtPpm(postDoseVal),
        deltaText: isPinned ? fmtDelta(ionDelta(postDoseVal, targetVal)) : "—",
        status: isPinned ? constraintStatusFor(effectiveMode, pin) : "Auto",
      };
    });

    const notes = [];
    const surplus = num(engine, N.surplusSpargeCapacity);
    if (surplus != null && surplus > 0) {
      notes.push(`HLT holds ${fmtL(surplus)} more than the sparge delivers.`);
    }
    const residualHlt = num(engine, N.residualHlt);
    const tanninWarning = engine.resolve(N.spargeTanninWarning) === true;

    const mashDose = doseList(app.fieldsById, N.mashAdditions, "Mash", forms);
    const spargeDose = doseList(app.fieldsById, N.spargeAdditions, "Sparge", forms);
    const mashDoseText = mashDose.map((d) => `${d.label} ${d.text}`.trim()).join(", ");
    const spargeDoseText = spargeDose.map((d) => `${d.label} ${d.text}`.trim()).join(", ");
    const hltStart = num(engine, N.hltStart);
    const basis = `Masses assume ${gypsum} · ${cacl2} · ${acid}`;

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

    app.waterSummary = {
      mode,
      resolvedMode,
      proportional,
      basis,
      mashDose,
      spargeDose,
      doseVolume,
      deliveredSparge,
      ions,
      pinnedIons: customPins,
      notes,
      tanninWarning,
      residualHlt,
      notModelled:
        "Not modelled: grist ions and metabisulfite (≤ ~8 mg/L SO₄ per tablet/15 US gal; ~15 mg/L in a 30 L HLT).",
      ratio,
      ratioBasis,
      ratioLine,
      telemetry,
      instructionSetup,
      instructionDoughIn,
      instructionSparge,
    };
  } catch (err) {
    reportError("waterCard.refresh", err);
    app.waterSummary = { ...app.waterSummary, mode: "", ions: [], notes: [], telemetry: [] };
  }
}

export const KEYS = ["waterSummary", "waterModes", "waterModeLabel", "waterPinModalOpen", "waterPinOptions", "setWaterMode", "openWaterPinModal", "closeWaterPinModal", "waterPinChecked", "waterPinDisabled", "toggleWaterPin", "waterInstruction", "telemetryLine", "telemetryClass", "waterModeBanner"];
