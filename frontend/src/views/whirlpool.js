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

// Charges share one knockout end, so a duration also fixes the addition time.
// Two charges within these tolerances are one addition; a posted temperature is
// compared with the latent curve at that offset: below it is a forced chill,
// above it is heating (rejected).
export const WHIRLPOOL_TEMP_TOLERANCE_C = 0.5;
export const WHIRLPOOL_DURATION_TOLERANCE_MIN = 0.05;

function timelineError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function requireAboveAmbient(atMin, tempC, ambientTempC) {
  if (tempC < ambientTempC - WHIRLPOOL_TEMP_TOLERANCE_C) {
    throw timelineError(
      "WHIRLPOOL_BELOW_AMBIENT",
      `Charge at ${atMin.toFixed(1)} min posts ${tempC.toFixed(1)} °C, below the ` +
        `${ambientTempC.toFixed(1)} °C ambient; the kettle only cools toward ambient.`
    );
  }
}

export function whirlpoolAdditions(rows, endMinutes) {
  const ordered = [...rows].sort(
    (a, b) => (Number(b.duration_min) || 0) - (Number(a.duration_min) || 0)
  );
  const groups = [];
  for (const row of ordered) {
    const duration = Number(row.duration_min) || 0;
    const temp = Number(row.initial_temp_c) || 0;
    const last = groups[groups.length - 1];
    if (last && Math.abs(last.duration - duration) <= WHIRLPOOL_DURATION_TOLERANCE_MIN) {
      if (Math.abs(last.temp - temp) > WHIRLPOOL_TEMP_TOLERANCE_C) {
        throw timelineError(
          "WHIRLPOOL_ADDITION_CONFLICT",
          `Two whirlpool charges share a ${duration.toFixed(1)}-minute rest but post ` +
            `${last.temp.toFixed(1)} °C and ${temp.toFixed(1)} °C; one addition time ` +
            "cannot have two temperatures."
        );
      }
      continue;
    }
    groups.push({ duration, at: endMinutes - duration, temp });
  }
  return groups;
}

export function whirlpoolTimeline(
  rows,
  { ambientTempC = DEFAULT_AMBIENT_TEMP_C, kPerMin = DEFAULT_K_PER_MIN } = {}
) {
  const list = rows ?? [];
  if (!list.length) {
    return { endMinutes: 0, segments: [], chills: [], effectiveMinutes: () => 0 };
  }
  const endMinutes = Math.max(...list.map((row) => Number(row.duration_min) || 0));
  const additions = whirlpoolAdditions(list, endMinutes);
  const first = additions[0];
  requireAboveAmbient(first.at, first.temp, ambientTempC);

  const segments = [];
  const chills = [];
  let currentTime = 0;
  let currentTemp = first.temp;
  for (const addition of additions.slice(1)) {
    requireAboveAmbient(addition.at, addition.temp, ambientTempC);
    if (addition.at > currentTime + 1e-9) {
      segments.push({ start: currentTime, end: addition.at, temp: currentTemp });
      currentTemp = coolingTemperature(
        addition.at - currentTime,
        currentTemp,
        ambientTempC,
        kPerMin
      );
      currentTime = addition.at;
    }
    if (addition.temp > currentTemp + WHIRLPOOL_TEMP_TOLERANCE_C) {
      throw timelineError(
        "WHIRLPOOL_HEATING",
        `Charge at ${addition.at.toFixed(1)} min posts ${addition.temp.toFixed(1)} °C, ` +
          `above the ${currentTemp.toFixed(1)} °C the kettle reaches on the cooling curve; ` +
          "heating is not modelled."
      );
    }
    if (addition.temp < currentTemp - WHIRLPOOL_TEMP_TOLERANCE_C) {
      chills.push({ atMin: addition.at, fromTempC: currentTemp, toTempC: addition.temp });
      currentTemp = addition.temp;
    }
  }
  if (endMinutes > currentTime + 1e-9) {
    segments.push({ start: currentTime, end: endMinutes, temp: currentTemp });
  }

  const effectiveMinutes = (startMinutes) => {
    let total = 0;
    for (const segment of segments) {
      const lo = Math.max(startMinutes, segment.start);
      if (segment.end - lo <= 1e-12) continue;
      const tempAtLo = coolingTemperature(
        lo - segment.start,
        segment.temp,
        ambientTempC,
        kPerMin
      );
      total += effectiveWhirlpoolMinutes({
        durationMin: segment.end - lo,
        initialTempC: tempAtLo,
        ambientTempC,
        kPerMin,
      });
    }
    return total;
  };

  return { endMinutes, segments, chills, effectiveMinutes };
}

export function whirlpoolMassFromEffective({
  ibu,
  alphaFraction,
  volumeL,
  gravity,
  effectiveMinutes,
  productForm = "t90_pellet",
  initialTempC = DEFAULT_INITIAL_TEMP_C,
}) {
  const utilization =
    whirlpoolUtilization(gravity, effectiveMinutes) *
    productFormUtilization(productForm, initialTempC);
  if (!(ibu > 0) || !(alphaFraction > 0) || !(volumeL > 0) || !(utilization > 0)) return null;
  return (ibu * volumeL) / (alphaFraction * 1000 * utilization) / 1000;
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
  return whirlpoolMassFromEffective({
    ibu,
    alphaFraction,
    volumeL,
    gravity,
    effectiveMinutes,
    productForm,
    initialTempC,
  });
}
