// Tinseth bitterness math. Offline boundary stub only; production uses
// backend/app/core/hop_solver.py.
//
// Glenn Tinseth's utilization model:
//   bigness     = 1.65 * 0.000125^(SG_boil - 1)
//   time_factor = (1 - e^(-0.04 * time_min)) / 4.15
//   U           = bigness * time_factor
//   IBU         = U * alpha_fraction * oz * 7489 / gallons
//
// `alpha_fraction` is a decimal (6.5% -> 0.065). The 7489 constant folds the
// oz->mg and gal->L conversions plus the iso-alpha contribution, so it pairs
// with a fraction (not a whole-number percent).
//
// These helpers take SI inputs (kg, L) and convert internally so the engine and
// persistence keep base units while the classic empirical formula stays intact.

const KG_PER_OZ = 0.028349523125;
const L_PER_GAL = 3.785411784;
const TINSETH_FACTOR = 7489;

export function tinsethUtilization(boilGravitySg, timeMin) {
  if (!(boilGravitySg > 0) || !(timeMin >= 0)) return 0;
  const bigness = 1.65 * Math.pow(0.000125, boilGravitySg - 1);
  const timeFactor = (1 - Math.exp(-0.04 * timeMin)) / 4.15;
  return bigness * timeFactor;
}

export function ibuFromMass(massKg, alphaFraction, timeMin, boilGravitySg, volumeL) {
  const utilization = tinsethUtilization(boilGravitySg, timeMin);
  if (utilization <= 0 || !(alphaFraction > 0) || !(volumeL > 0)) return null;
  const massOz = massKg / KG_PER_OZ;
  const volumeGal = volumeL / L_PER_GAL;
  return (utilization * alphaFraction * massOz * TINSETH_FACTOR) / volumeGal;
}

export function massFromIbu(ibu, alphaFraction, timeMin, boilGravitySg, volumeL) {
  const utilization = tinsethUtilization(boilGravitySg, timeMin);
  if (!(ibu > 0) || utilization <= 0 || !(alphaFraction > 0) || !(volumeL > 0)) return null;
  const volumeGal = volumeL / L_PER_GAL;
  const massOz = (ibu * volumeGal) / (utilization * alphaFraction * TINSETH_FACTOR);
  return massOz * KG_PER_OZ;
}
