// The objective-vs-actual grid rows: one pure builder, testable without the
// card. The stage-2 correction moves alkalinity and, through the agent, calcium
// and sodium; a held objective it moved is held before the correction, not in
// the finished water.

import { fmtDelta, fmtPpm, ionDelta } from "./waterLogic.js";
import { NO_OBJECTIVE, rowState } from "./waterMessages.js";

const CORRECTION_IONS = new Set(["ca", "na", "alk"]);
const DRIFT_TOLERANCE = 0.05;

function hasDrifted(pin, isChecked, isValued, postDoseVal, targetVal) {
  return (
    isChecked &&
    isValued &&
    CORRECTION_IONS.has(pin) &&
    typeof postDoseVal === "number" &&
    Math.abs(postDoseVal - targetVal) > DRIFT_TOLERANCE
  );
}

/**
 * Build the objective-vs-actual grid rows.
 *
 * @pure
 * @param {object} args
 * @returns {ReadonlyArray<object>}
 */
export function ionRows({
  ions,
  checked,
  valued,
  route,
  phCorrected,
  read,
  sourceReport,
  target,
  postDose,
  kettleBlend,
}) {
  return ions.map(({ ion, pin, label, source }) => {
    const sourceVal = read(`${sourceReport}.${source}`);
    const targetVal = read(`${target}.${ion}`);
    const postDoseVal = read(`${postDose}.${ion}`);
    const kettleVal = read(`${kettleBlend}.${ion}`);
    const isChecked = checked.has(pin);
    const isValued = valued.has(pin) && typeof targetVal === "number";
    const below = isValued && typeof sourceVal === "number" && targetVal < sourceVal;
    const drifted = hasDrifted(pin, isChecked, isValued, postDoseVal, targetVal);
    const state = rowState({
      isChecked,
      isValued,
      below,
      drifted,
      phCorrected,
      pin,
      route,
    });
    return {
      ion,
      pin,
      label,
      checkboxLabel: `Objective ${label}`,
      inputLabel: `${label} objective (ppm)`,
      checked: isChecked,
      targetValue: typeof targetVal === "number" ? targetVal : 0,
      sourceValue: typeof sourceVal === "number" ? sourceVal : 0,
      belowSource: isValued && below,
      valueText: isValued ? fmtPpm(targetVal) : NO_OBJECTIVE,
      sourceText: fmtPpm(sourceVal),
      postDoseText: fmtPpm(postDoseVal),
      kettleText: fmtPpm(kettleVal),
      deltaText: isValued ? fmtDelta(ionDelta(postDoseVal, targetVal)) : "—",
      status: state.status,
      hint: state.hint,
    };
  });
}
