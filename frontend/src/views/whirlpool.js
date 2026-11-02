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
  whole_cone: null,
  t90_pellet: 1.0,
  flowable_extract: 1.15,
  lupulin_pellet: 1.1,
};

// Product-form efficiency, shared by both processes. A flowable extract leaves no
// vegetative matter behind and its resin is already ruptured, so it delivers more
// IBU per unit of alpha; a boil applies the scalar isothermally. Whole cone has no
// published figure, so the batch supplies one and a null result means the charge
// cannot be priced rather than defaulting to a pellet.
export function productFormUtilization(productForm, coneUtilization = null) {
  const value = PRODUCT_FORM_UTILIZATION[productForm];
  if (value === null) return coneUtilization ?? null;
  return value ?? 1.0;
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

export function whirlpoolAdditions(rows) {
  const ordered = [...rows].sort(
    (a, b) => (Number(a.addition_at_min) || 0) - (Number(b.addition_at_min) || 0)
  );
  const groups = [];
  for (const row of ordered) {
    const at = Number(row.addition_at_min) || 0;
    const temp = Number(row.initial_temp_c) || 0;
    const last = groups[groups.length - 1];
    if (last && Math.abs(last.at - at) <= WHIRLPOOL_DURATION_TOLERANCE_MIN) {
      if (Math.abs(last.temp - temp) > WHIRLPOOL_TEMP_TOLERANCE_C) {
        throw timelineError(
          "WHIRLPOOL_ADDITION_CONFLICT",
          `Two whirlpool charges share a ${at.toFixed(1)}-minute addition but post ` +
            `${last.temp.toFixed(1)} °C and ${temp.toFixed(1)} °C; one addition time ` +
            "cannot have two temperatures."
        );
      }
      continue;
    }
    groups.push({ at, temp });
  }
  return groups;
}

function checkWhirlpoolAddition(addition, endMinutes, currentTemp, ambientTempC) {
  if (addition.at > endMinutes + WHIRLPOOL_DURATION_TOLERANCE_MIN) {
    throw timelineError(
      "INVALID_HOP_INPUT",
      `Charge at ${addition.at.toFixed(1)} min is added after the ` +
        `${endMinutes.toFixed(1)}-min knockout; move it inside the window.`
    );
  }
  requireAboveAmbient(addition.at, addition.temp, ambientTempC);
  if (addition.temp > currentTemp + WHIRLPOOL_TEMP_TOLERANCE_C) {
    throw timelineError(
      "WHIRLPOOL_HEATING",
      `Charge at ${addition.at.toFixed(1)} min posts ${addition.temp.toFixed(1)} °C, ` +
        `above the ${currentTemp.toFixed(1)} °C the kettle reaches on the cooling curve; ` +
        "heating is not modelled."
    );
  }
}

export function whirlpoolTimeline(
  rows,
  {
    ambientTempC = DEFAULT_AMBIENT_TEMP_C,
    kPerMin = DEFAULT_K_PER_MIN,
    knockoutMin = DEFAULT_REST_DURATION_MIN,
    startTempC = DEFAULT_INITIAL_TEMP_C,
  } = {}
) {
  const list = rows ?? [];
  if (!(knockoutMin > 0)) {
    return { endMinutes: 0, segments: [], chills: [], effectiveMinutes: () => 0 };
  }
  const endMinutes = knockoutMin;
  requireAboveAmbient(0, startTempC, ambientTempC);
  const additions = whirlpoolAdditions(list);

  const segments = [];
  const chills = [];
  let currentTime = 0;
  let currentTemp = startTempC;
  for (const addition of additions) {
    checkWhirlpoolAddition(addition, endMinutes, currentTemp, ambientTempC);
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
  coneUtilization = null,
}) {
  const form = productFormUtilization(productForm, coneUtilization);
  if (form === null) return null;
  const utilization = whirlpoolUtilization(gravity, effectiveMinutes) * form;
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
  coneUtilization = null,
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
  const form = productFormUtilization(productForm, coneUtilization);
  if (form === null) return { ibu: 0, effectiveMinutes: 0, utilization: 0 };
  const utilization = whirlpoolUtilization(gravity, effectiveMinutes) * form;
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
  coneUtilization = null,
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
    coneUtilization,
  });
}
