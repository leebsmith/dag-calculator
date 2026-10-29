// Whirlpool bitterness: Arrhenius isomerization over Newton cooling, integrated
// into the Tinseth time/gravity factors. Offline boundary stub only; production
// uses backend/app/core/hop_solver.py.

export const DEFAULT_AMBIENT_TEMP_C = 20;
export const DEFAULT_K_PER_MIN = 0.0092;
export const DEFAULT_COOLING_TIME_CONSTANT_MIN = 1 / DEFAULT_K_PER_MIN;
export const DEFAULT_REST_DURATION_MIN = 30;
export const DEFAULT_INITIAL_TEMP_C = 99;

const RATE_PREFACTOR = 2.39e11;
const RATE_EXPONENT_K = 9773;

export const PRODUCT_FORM_UTILIZATION = {
  t90_pellet: 1.0,
  flowable_extract: 1.15,
  lupulin_pellet: 1.1,
};

// Flowable extracts disperse poorly as the wort cools, so their multiplier ramps
// between the two measured bounds; T-90 and lupulin pellets are static.
export const FLOWABLE_LOW_TEMP_C = 75;
export const FLOWABLE_HIGH_TEMP_C = 90;
export const FLOWABLE_LOW_UTILIZATION = 0.8;

export function productFormUtilization(productForm, temperatureC = null) {
  const base = PRODUCT_FORM_UTILIZATION[productForm] ?? 1.0;
  if (productForm !== "flowable_extract" || temperatureC === null) return base;
  if (!Number.isFinite(temperatureC)) return base;
  if (temperatureC <= FLOWABLE_LOW_TEMP_C) return FLOWABLE_LOW_UTILIZATION;
  if (temperatureC >= FLOWABLE_HIGH_TEMP_C) return base;
  const ramp =
    (temperatureC - FLOWABLE_LOW_TEMP_C) / (FLOWABLE_HIGH_TEMP_C - FLOWABLE_LOW_TEMP_C);
  const smooth = ramp * ramp * (3 - 2 * ramp);
  return FLOWABLE_LOW_UTILIZATION + smooth * (base - FLOWABLE_LOW_UTILIZATION);
}

export function relativeIsomerizationRate(tempC) {
  const kelvin = tempC + 273.15;
  if (!(kelvin > 0)) return 0;
  return RATE_PREFACTOR * Math.exp(-RATE_EXPONENT_K / kelvin);
}

export function coolingTemperature(tMin, initialTempC, ambientTempC, kPerMin) {
  if (!(tMin > 0)) return initialTempC;
  return ambientTempC + (initialTempC - ambientTempC) * Math.exp(-kPerMin * tMin);
}

function simpson(fn, a, b) {
  const mid = (a + b) / 2;
  return ((b - a) / 6) * (fn(a) + 4 * fn(mid) + fn(b));
}

function adaptiveSimpson(fn, a, b, tolerance, whole, depth) {
  const mid = (a + b) / 2;
  const left = simpson(fn, a, mid);
  const right = simpson(fn, mid, b);
  const delta = left + right - whole;
  if (depth <= 0 || Math.abs(delta) <= 15 * tolerance) {
    return left + right + delta / 15;
  }
  return (
    adaptiveSimpson(fn, a, mid, tolerance / 2, left, depth - 1) +
    adaptiveSimpson(fn, mid, b, tolerance / 2, right, depth - 1)
  );
}

export function effectiveWhirlpoolMinutes({
  durationMin,
  initialTempC = DEFAULT_INITIAL_TEMP_C,
  ambientTempC = DEFAULT_AMBIENT_TEMP_C,
  kPerMin = DEFAULT_K_PER_MIN,
}) {
  if (!(durationMin > 0)) return 0;
  if (!Number.isFinite(initialTempC) || !Number.isFinite(ambientTempC)) return 0;
  if (!Number.isFinite(kPerMin) || kPerMin < 0) return 0;
  const start = Math.max(initialTempC, ambientTempC);
  const fn = (t) =>
    relativeIsomerizationRate(coolingTemperature(t, start, ambientTempC, kPerMin));
  const whole = simpson(fn, 0, durationMin);
  return adaptiveSimpson(fn, 0, durationMin, 1e-10, whole, 20);
}

export function whirlpoolUtilization(gravity, effectiveMinutes) {
  if (!(gravity > 0) || !(effectiveMinutes >= 0)) return 0;
  const gravityFactor = 1.65 * Math.pow(0.000125, gravity - 1);
  const timeFactor = (1 - Math.exp(-0.04 * effectiveMinutes)) / 4.15;
  return gravityFactor * timeFactor;
}

export function whirlpoolIbu({
  massKg,
  alphaFraction,
  volumeL,
  gravity,
  durationMin,
  initialTempC = DEFAULT_INITIAL_TEMP_C,
  ambientTempC = DEFAULT_AMBIENT_TEMP_C,
  kPerMin = DEFAULT_K_PER_MIN,
  productForm = "t90_pellet",
}) {
  if (!(massKg > 0) || !(alphaFraction > 0) || !(volumeL > 0) || !(gravity > 0)) {
    return { ibu: 0, effectiveMinutes: 0, utilization: 0 };
  }
  const effectiveMinutes = effectiveWhirlpoolMinutes({
    durationMin,
    initialTempC,
    ambientTempC,
    kPerMin,
  });
  const utilization =
    whirlpoolUtilization(gravity, effectiveMinutes) *
    productFormUtilization(productForm, initialTempC);
  const concentrationMgL = (massKg * 1000 * alphaFraction * 1000) / volumeL;
  return {
    ibu: concentrationMgL * utilization,
    effectiveMinutes,
    utilization,
  };
}

export function whirlpoolMassKg({
  ibu,
  alphaFraction,
  volumeL,
  gravity,
  durationMin,
  initialTempC = DEFAULT_INITIAL_TEMP_C,
  ambientTempC = DEFAULT_AMBIENT_TEMP_C,
  kPerMin = DEFAULT_K_PER_MIN,
  productForm = "t90_pellet",
}) {
  if (!(ibu > 0) || !(alphaFraction > 0) || !(volumeL > 0) || !(gravity > 0)) return null;
  const effectiveMinutes = effectiveWhirlpoolMinutes({
    durationMin,
    initialTempC,
    ambientTempC,
    kPerMin,
  });
  const utilization =
    whirlpoolUtilization(gravity, effectiveMinutes) *
    productFormUtilization(productForm, initialTempC);
  if (!(utilization > 0)) return null;
  const massG = (ibu * volumeL) / (alphaFraction * 1000 * utilization);
  return massG / 1000;
}
