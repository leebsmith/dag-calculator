// Sugar-effect readout: what the current late-addition dose is doing to the
// batch without changing the ABV pin. Pure; every input comes from the solved
// batch, so the numbers are derived, never persisted.
//
// The decomposition holds the apparent extract and removes the sugar's extract
// share from OE. Sugar is fully fermentable, so it contributes no residual
// extract (ΔFG = 0) and its alcohol is the ABV drop when that share is removed.

import { cutaiaAbv, platoToSg, sgToPlato } from "../../engine/fermentation.js";

const ZERO = Object.freeze({
  active: false,
  share: 0,
  ogPoints: 0,
  fgPoints: 0,
  abvPoints: 0,
  gristKg: null,
});

function finite(value) {
  return typeof value === "number" && Number.isFinite(value);
}

export function sugarEffect({
  extractTotalKg,
  sugarExtractKg,
  sgPostBoil,
  apparentAttenuation,
  gristYield,
  grainMoisture = 0,
}) {
  if (
    !finite(extractTotalKg) ||
    !finite(sugarExtractKg) ||
    !finite(sgPostBoil) ||
    !finite(apparentAttenuation) ||
    extractTotalKg <= 0 ||
    sugarExtractKg <= 0
  ) {
    return ZERO;
  }

  const share = Math.min(sugarExtractKg / extractTotalKg, 1);
  const oe = sgToPlato(sgPostBoil);
  const ae = oe * (1 - apparentAttenuation);
  const sugarOe = oe * share;
  const withoutSugarOe = oe - sugarOe;

  const ogPoints = sgPostBoil - platoToSg(withoutSugarOe);
  const abvPoints = cutaiaAbv(oe, ae) - cutaiaAbv(withoutSugarOe, ae);
  const yieldAsIs = finite(gristYield) ? gristYield * (1 - (grainMoisture ?? 0)) : null;
  const gristKg = yieldAsIs && yieldAsIs > 0 ? sugarExtractKg / yieldAsIs : null;

  return {
    active: true,
    share,
    ogPoints,
    fgPoints: 0,
    abvPoints,
    gristKg,
  };
}
