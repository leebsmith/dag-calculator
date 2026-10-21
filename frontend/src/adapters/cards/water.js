// Water card: treatment summary, treated-water vectors against the target
// profile, and the mode-specific brew-day dosing instruction. All readouts are
// derived from declared outputs and roots — no engine path resolution leaks into
// the template. Node ids live in the registry (WATER_NODES).

import { fieldOr, formatQuantity, formatValue } from "../../utils.js";
import { WATER_NODES as N, waterRegistry } from "../../views/registry/water.js";
import { reportError } from "../../observability.js";

const IONS = [
  ["calcium_ca", "Calcium"],
  ["magnesium_mg", "Magnesium"],
  ["sodium_na", "Sodium"],
  ["sulfate_so4", "Sulfate"],
  ["chloride_cl", "Chloride"],
  ["alkalinity_as_caco3", "Alkalinity"],
];

const ADDITIONS = ["gypsum_kg", "cacl2_kg", "epsom_kg", "nacl_kg", "acid_l", "baking_soda_kg", "chalk_kg", "pickling_lime_kg"];

export function kettleBlend(mash, hlt, runnings, sparge) {
  const total = runnings + sparge;
  if (!(total > 0)) return null;
  const out = {};
  for (const [ion] of IONS) {
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
  for (const [ion] of IONS) out[ion] = num(engine, `${prefix}.${ion}`);
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

export function registerWaterCard(app) {
  Object.assign(app, {
    waterSummary: {
      mode: null,
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
    },

    waterInstruction(stepId) {
      const s = this.waterSummary;
      if (stepId === "dough-in") return s.instructionDoughIn ?? "";
      if (stepId === "batch-sparge") return s.instructionSparge ?? "";
      if (stepId === "brew-day-setup") return s.instructionSetup ?? "";
      return "";
    },
  });
}

export function refreshWaterCard(app, ctx) {
  const engine = ctx.engine;
  try {
    const mode = engine.get(N.saltDistribution);
    const proportional = mode === "PROPORTIONAL";
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
    const targetIons = ionVector(engine, N.targetProfile);
    const kettle = kettleBlend(mashIons, hltIons, run1 + run2, sparge);

    const ions = IONS.map(([ion, label]) => {
      const m = mashIons[ion];
      const h = hltIons[ion];
      const t = targetIons[ion];
      const k = kettle?.[ion] ?? null;
      const kDelta = ionDelta(k, t);
      return {
        ion,
        label,
        mashText: fmtPpm(m),
        hltText: fmtPpm(h),
        kettleText: fmtPpm(k),
        targetText: fmtPpm(t),
        kettleDeltaText: fmtDelta(kDelta),
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

    app.waterSummary = {
      mode,
      proportional,
      basis,
      mashDose,
      spargeDose,
      doseVolume,
      deliveredSparge,
      ions,
      notes,
      tanninWarning,
      residualHlt,
      notModelled:
        "Not modelled: grist ions and metabisulfite (≤ ~8 mg/L SO₄ per tablet/15 US gal; ~15 mg/L in a 30 L HLT).",
      instructionSetup,
      instructionDoughIn,
      instructionSparge,
    };
  } catch (err) {
    reportError("waterCard.refresh", err);
    app.waterSummary = { ...app.waterSummary, mode: null, ions: [], notes: [] };
  }
}

export const KEYS = ["waterSummary", "waterInstruction"];
