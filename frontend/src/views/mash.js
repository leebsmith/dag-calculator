// Pure mash-schedule helpers for the Mash Profile card — a port of the legacy
// brewing-calculator `utils/mashSchedule.js`, adapted to this repo's collection
// shape (`mash.rests` rows of { rest_id, enabled, use_temp_c, duration_min }).
//
// Framework- and engine-free: these never touch the engine and never do unit
// conversion (guards A2 / A8a). The stepAdapter owns engine reads/writes and
// display conversion; this module only owns the rest vocabulary, preset matrix,
// ordering, LoA model, and validation.

/**
 * Canonical rest vocabulary, in canonical order. The array index is the
 * tiebreaker when two enabled rests share a "use" temperature. Do not reorder
 * without updating the design record.
 */
export const CANONICAL_RESTS = Object.freeze([
  {
    rest_id: "phytase",
    name: "Phytase / Acid Rest",
    temp_min_c: 35,
    temp_max_c: 52,
    purpose: "Lowers mash pH naturally (rarely used today; replaced by modern brewing acids).",
  },
  {
    rest_id: "ferulic",
    name: "Ferulic Acid Rest",
    temp_min_c: 43,
    temp_max_c: 45,
    purpose: "Releases ferulic acid to create the clove-like aroma in German Hefeweizens.",
  },
  {
    rest_id: "beta_glucan",
    name: "Beta-Glucan Rest",
    temp_min_c: 45,
    temp_max_c: 50,
    purpose: "Breaks down gums in sticky, high-viscosity grains like oats, rye, and unmalted wheat.",
  },
  {
    rest_id: "protein",
    name: "Protein Rest",
    temp_min_c: 50,
    temp_max_c: 54,
    purpose: "Breaks down complex proteins to improve yeast health and reduce chill haze in under-modified malts.",
  },
  {
    rest_id: "beta_amylase",
    name: "Beta-Amylase Rest",
    temp_min_c: 62,
    temp_max_c: 65,
    purpose: "Creates highly fermentable sugars (maltose) for a dry, clean-finishing beer with high alcohol conversion.",
  },
  {
    rest_id: "alpha_amylase",
    name: "Alpha-Amylase Rest",
    temp_min_c: 68,
    temp_max_c: 72,
    purpose: "Breaks down remaining starches into unfermentable dextrins, adding body and reducing fermentability.",
  },
  {
    rest_id: "beta_alpha_amylase",
    name: "Beta/Alpha-Amylase Rest",
    temp_min_c: 62,
    temp_max_c: 72,
    purpose: "Simultaneous beta- and alpha-amylase activity for balanced everyday brewing. Used as the \"single infusion\" rest.",
  },
]);

/**
 * The two always-present bookend steps. Dough-in is the first rest; its "use"
 * temperature is derived from the first enabled optional rest (see the derived
 * node `mash.dough_in_target_temp_c`). Mash-out is a separate step constrained
 * to 75.5–76.7 °C. Neither participates in the preset toggle set.
 */
export const DOUGH_IN_REST = Object.freeze({
  rest_id: "dough_in",
  name: "Dough-in",
  temp_min_c: null,
  temp_max_c: null,
  purpose: "First rest. Strike water temperature is derived from the dough-in target temperature.",
});

export const MASH_OUT_REST = Object.freeze({
  rest_id: "mash_out",
  name: "Mash-out",
  temp_min_c: 75.5,
  temp_max_c: 76.7,
  purpose: "Raises the mash to mash-out temperature to halt enzymatic activity and improve lautering.",
});

/**
 * Named preset matrix. Each preset lists the canonical `rest_id`s it enables.
 * Dough-in and mash-out are always present and are not listed here.
 */
export const MASH_PRESETS = Object.freeze({
  single_infusion: Object.freeze(["beta_alpha_amylase"]),
  custom: Object.freeze([]),
  belgian_saison: Object.freeze(["beta_glucan", "protein", "beta_amylase"]),
  belgian_tripel: Object.freeze(["beta_amylase"]),
  german_pils: Object.freeze(["beta_amylase", "alpha_amylase"]),
  berliner_weisse: Object.freeze(["phytase", "beta_alpha_amylase"]),
  english_brown: Object.freeze(["alpha_amylase"]),
  american_pale: Object.freeze(["beta_alpha_amylase"]),
});

/**
 * Human-readable labels for the preset dropdown (object order = menu order).
 */
export const MASH_PRESET_LABELS = Object.freeze({
  single_infusion: "Single Infusion",
  custom: "Custom",
  belgian_saison: "Belgian Saison / Bière de Garde",
  belgian_tripel: "Belgian Tripel / Dubbel / Golden Strong",
  german_pils: "German Pils / Dortmunder (Hochkurz)",
  berliner_weisse: "Traditional Berliner Weisse",
  english_brown: "English Brown / Mild / Oatmeal Stout",
  american_pale: "American Pale / IPA / Porter / Standard Ale",
});

/** Look up a canonical rest definition by `rest_id`. */
export function getCanonicalRest(restId) {
  if (restId === DOUGH_IN_REST.rest_id) return DOUGH_IN_REST;
  if (restId === MASH_OUT_REST.rest_id) return MASH_OUT_REST;
  return CANONICAL_RESTS.find((r) => r.rest_id === restId) || null;
}

/** Canonical-order index for a rest_id (dough-in first, mash-out last). */
export function canonicalOrderIndex(restId) {
  if (restId === DOUGH_IN_REST.rest_id) return -1;
  if (restId === MASH_OUT_REST.rest_id) return CANONICAL_RESTS.length;
  const idx = CANONICAL_RESTS.findIndex((r) => r.rest_id === restId);
  return idx === -1 ? CANONICAL_RESTS.length + 1 : idx;
}

function bookendRank(restId) {
  if (restId === DOUGH_IN_REST.rest_id) return -1;
  if (restId === MASH_OUT_REST.rest_id) return 1;
  return 0;
}

/**
 * Sort rests into ascending "use" temperature order, bookends pinned first/last,
 * ties broken by canonical order. Non-mutating.
 */
export function sortRestsByTemperature(rests) {
  return [...rests].sort((a, b) => {
    const aBookend = bookendRank(a.rest_id);
    const bBookend = bookendRank(b.rest_id);
    if (aBookend !== bBookend) return aBookend - bBookend;

    const aTemp = a.use_temp_c;
    const bTemp = b.use_temp_c;
    const aHas = typeof aTemp === "number" && !isNaN(aTemp);
    const bHas = typeof bTemp === "number" && !isNaN(bTemp);

    if (aHas && bHas && aTemp !== bTemp) return aTemp - bTemp;
    if (aHas !== bHas) return aHas ? -1 : 1;
    return canonicalOrderIndex(a.rest_id) - canonicalOrderIndex(b.rest_id);
  });
}

/** True when at least one enabled rest is an optional (non-bookend) rest. */
export function hasOptionalRests(enabledRests) {
  return (enabledRests || []).some(
    (r) => r.rest_id !== DOUGH_IN_REST.rest_id && r.rest_id !== MASH_OUT_REST.rest_id
  );
}

/** Total mash time in minutes: the sum of every enabled rest's duration. */
export function totalMashDurationMin(enabledRests) {
  return (enabledRests || []).reduce((sum, r) => sum + (parseFloat(r.duration_min) || 0), 0);
}

/**
 * True when every enabled rest has a use-temperature and a non-negative
 * duration. Dough-in's temperature is derived (its target is the first enabled
 * optional rest's temperature), so it is validated against `doughInTempC`
 * rather than its stored `use_temp_c`.
 */
export function isMashScheduleValid(enabledRests, doughInTempC) {
  return (enabledRests || []).every((r) => {
    const hasTemp =
      r.rest_id === DOUGH_IN_REST.rest_id
        ? doughInTempC != null
        : typeof r.use_temp_c === "number" && !isNaN(r.use_temp_c);
    const hasDuration =
      typeof r.duration_min === "number" && !isNaN(r.duration_min) && r.duration_min >= 0;
    return hasTemp && hasDuration;
  });
}

/**
 * Apply a named preset to a rests array: flips `enabled` flags and seeds a
 * sensible default "use" temperature the first time a rest is enabled, without
 * clobbering a value the user has already set. Bookends are never preset-
 * controlled. Non-mutating.
 */
export function applyMashPreset(rests, presetId) {
  const enabledIds = MASH_PRESETS[presetId];
  if (!enabledIds) return rests;

  return rests.map((rest) => {
    if (rest.rest_id === DOUGH_IN_REST.rest_id || rest.rest_id === MASH_OUT_REST.rest_id) {
      return { ...rest };
    }
    const shouldEnable = enabledIds.includes(rest.rest_id);
    const canonical = getCanonicalRest(rest.rest_id);
    return {
      ...rest,
      enabled: shouldEnable,
      use_temp_c:
        shouldEnable && rest.use_temp_c == null && canonical && canonical.temp_min_c != null
          ? (canonical.temp_min_c + canonical.temp_max_c) / 2
          : rest.use_temp_c,
    };
  });
}

// ---------------------------------------------------------------------------
// Limit of Attenuation (Google Rule of Thumb), informational only.
// ---------------------------------------------------------------------------

export const LOA_MIN_C = 64.0;
export const LOA_MAX_C = 70.0;
export const LOA_BASELINE_TEMP_F = 152.0;
export const LOA_BASELINE_ATTENUATION_PCT = 75.0;
export const LOA_TEMP_COEFFICIENT = 1.2;

/**
 * Estimate the LoA for a single saccharification rest (fraction in [0, 1]).
 * Returns NaN outside the saccharification range [64, 70] °C.
 */
export function estimateSingleRestLoaPct(
  targetTempC,
  baselineTempF = LOA_BASELINE_TEMP_F,
  baselineAttenuationPct = LOA_BASELINE_ATTENUATION_PCT,
  tempCoefficient = LOA_TEMP_COEFFICIENT
) {
  const tempC = Number(targetTempC);
  if (isNaN(tempC) || tempC < LOA_MIN_C || tempC > LOA_MAX_C) return NaN;

  const tempF = (tempC * 9.0) / 5.0 + 32.0;
  const estimated = baselineAttenuationPct - (tempF - baselineTempF) * tempCoefficient;
  return Math.max(0.0, Math.min(100.0, estimated));
}

const SACCHARIFICATION = new Set(["beta_amylase", "alpha_amylase", "beta_alpha_amylase"]);

/**
 * Duration-weighted LoA over the schedule's saccharification rests, as a
 * fraction in [0, 1]. Rests outside the model's valid range score NaN and are
 * excluded. Returns NaN when no valid saccharification rest is enabled.
 */
export function estimateLimitOfAttenuation(rests) {
  let weightedSum = 0;
  let totalDuration = 0;

  for (const rest of rests) {
    if (!rest.enabled) continue;
    if (typeof rest.use_temp_c !== "number" || isNaN(rest.use_temp_c)) continue;
    if (typeof rest.duration_min !== "number" || isNaN(rest.duration_min)) continue;
    if (rest.duration_min <= 0) continue;
    if (!SACCHARIFICATION.has(rest.rest_id)) continue;

    const loaPct = estimateSingleRestLoaPct(rest.use_temp_c);
    if (isNaN(loaPct)) continue;

    weightedSum += loaPct * rest.duration_min;
    totalDuration += rest.duration_min;
  }

  if (totalDuration === 0) return NaN;
  return weightedSum / totalDuration / 100.0;
}
