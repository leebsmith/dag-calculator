// Water card: target selector, target-vs-actual grid, treatment summary, treated
// water against the target, telemetry audit log, and the mode-specific brew-day
// dosing instruction. The checked ion set is the constraint declaration; the
// solver strategy is derived from it. All readouts derive from declared outputs
// and roots — no engine path resolution leaks into the template. Node ids live
// in the registry (WATER_NODES).

import { fieldOr, formatQuantity, joinNonEmpty } from "../../utils.js";
import {
  WATER_IONS,
  WATER_NODES as N,
  constraintStatusFor,
  routeSummary,
  strategyForHeld,
  targetWarningFor,
} from "../../views/registry/water.js";
import {
  doseRows,
  fmtDelta,
  fmtL,
  fmtPpm,
  ionDelta,
  optionLabelFor,
  severityRank,
  waterTargetOptionsOf,
} from "../../views/waterLogic.js";
import { ratioReadout } from "../../views/waterRatio.js";
import {
  checkedPins,
  num,
  resolveValue,
  valuedPins,
  waterActions,
  waterDescriptors,
} from "./waterCardActions.js";

const AUTO_TARGET = "(Auto)";

export function createWaterCard(ctx) {
  const actions = waterActions(ctx);
  Object.defineProperties(actions, waterDescriptors(ctx));
  return actions;
}

export function createWaterLayers(ctx) {
  return [createWaterCard(ctx)];
}

export function refreshWaterCard(app, ctx) {
  const engine = ctx.engine;
  const read = (path) => num(engine, path, ctx.observability?.reportError);
  app.waterTargetProfileId = engine.get(N.targetProfileId) ?? "";
  app.waterTargetOptionsState = waterTargetOptionsOf(ctx.cache);
  try {
    const proportional = engine.get(N.saltDistribution) === "PROPORTIONAL";
    const strike = read(N.vMashTreat);
    const doseVolume = read(N.spargeSaltedVolume);
    const deliveredSparge = read(N.vSpargeDeliverable);

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

    // The checked set is the declaration and every checked ion carries a value.
    // The strategy is derived from that set.
    const checked = checkedPins(engine);
    const checkedSet = new Set(checked);
    const valued = valuedPins(engine);
    const valuedSet = new Set(valued);
    const stored = engine.get(N.strategy) ?? "";
    const effectiveMode = !stored || stored === "AUTO" ? strategyForHeld(valued) : stored;
    const resolvedMode =
      resolveValue(engine, N.resolvedStrategy, ctx.observability.reportError) ?? effectiveMode;

    // The target ratio is only a comparison basis when both flavor ions are
    // constrained; otherwise the readout stays as-solved only.
    const flavorConstrained = valuedSet.has("so4") && valuedSet.has("cl");
    const ratio = ratioReadout(
      read(N.kettleRatio),
      flavorConstrained ? read(N.targetRatio) : null
    );
    const ratioBasis = proportional
      ? "Kettle ratio — split mode: same concentration in both vessels."
      : "Kettle ratio — sparge untreated, acid only.";
    const ratioLine =
      ratio.targetText && ratio.deltaFactorText
        ? `${ratio.targetText} target → ${ratio.asSolvedText} kettle, ${ratio.deltaFactorText}`
        : ratio.asSolvedText;
    const ions = WATER_IONS.map(({ ion, pin, label, source }) => {
      const sourceVal = read(`${N.sourceReport}.${source}`);
      const targetVal = read(`${N.target}.${ion}`);
      const postDoseVal = read(`${N.postDoseIons}.${ion}`);
      const kettleVal = read(`${N.kettleBlend}.${ion}`);
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
        sourceValue: typeof sourceVal === "number" ? sourceVal : 0,
        belowSource: isValued && below,
        valueText: isValued ? fmtPpm(targetVal) : AUTO_TARGET,
        sourceText: fmtPpm(sourceVal),
        postDoseText: fmtPpm(postDoseVal),
        kettleText: fmtPpm(kettleVal),
        deltaText: isValued ? fmtDelta(ionDelta(postDoseVal, targetVal)) : "—",
        status,
        hint: isChecked && !isValued ? "no target entered" : below ? "below source" : "",
      };
    });

    const notes = [];
    const surplus = read(N.surplusSpargeCapacity);
    if (surplus != null && surplus > 0) {
      notes.push(`HLT holds ${fmtL(surplus)} more than the sparge delivers.`);
    }
    const residualHlt = read(N.residualHlt);

    const mashDoses = doseRows(ctx.fieldsById, N.mashAdditions, forms);
    const spargeDoses = doseRows(ctx.fieldsById, N.spargeAdditions, forms);
    const mashDoseText = mashDoses.rows.map((d) => `${d.label} ${d.text}`.trim()).join(", ");
    const spargeDoseText = spargeDoses.rows.map((d) => `${d.label} ${d.text}`.trim()).join(", ");
    const hltStart = read(N.hltStart);
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

    const telemetry = (ctx.waterTelemetry?.telemetry ?? []).slice();
    telemetry.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
    const warningCount = telemetry.filter(
      (t) => t?.severity === "WARNING" || t?.severity === "ERROR"
    ).length;

    const predictedField = fieldOr(ctx.fieldsById, N.predictedPh);
    const statusField = fieldOr(ctx.fieldsById, N.phStatus);
    const doseVolumeField = fieldOr(ctx.fieldsById, N.vHltTreat);
    const residualField = fieldOr(ctx.fieldsById, N.residualHlt);

    const sourceComponent = engine.identity?.[N.sourceReport] ?? {};
    const sourceTitle =
      sourceComponent.source_name || sourceComponent.laboratory || sourceComponent.report_id || "";
    const sourceDetail = joinNonEmpty(
      [
        sourceComponent.laboratory && sourceComponent.laboratory !== sourceTitle
          ? sourceComponent.laboratory
          : "",
        sourceComponent.report_id ? `report ${sourceComponent.report_id}` : "",
        sourceComponent.date_reported || "",
      ],
      " · "
    );
    app.waterPlan = {
      source: {
        label: "Source water",
        title: sourceTitle,
        detail: sourceDetail,
        hint: "Fixed by the batch identity",
      },
      target: fieldOr(ctx.fieldsById, N.targetProfileId),
      floor: fieldOr(ctx.fieldsById, N.calciumFloor),
      mashPh: fieldOr(ctx.fieldsById, N.targetMashPh),
    };
    app.waterTreatmentFields = [
      N.saltDistribution,
      N.acidMedium,
      N.gypsumForm,
      N.cacl2Form,
      N.alkalineAgent,
    ]
      .map((id) => fieldOr(ctx.fieldsById, id))
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
      pending: ctx.boundaryPending,
      basis,
      destinations: "Mash → dry grist, before underletting · Sparge → HLT after top-up",
    };

    app.waterDetails = {
      telemetry,
      ratioBasis,
      notModelled,
      boundaryStatus: ctx.boundaryStatuses?.[N.waterBoundary] ?? "ok",
      error: ctx.boundaryError ?? null,
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
    ctx.observability.reportError("waterCard.refresh", err);
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
  "waterTargetOptionsState",
  "waterTargetProfileId",
  "editWaterNumber",
  "commitWaterNumber",
  "editWaterTargetInput",
  "commitWaterTargetInput",
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
