// Pure mash-schedule helpers for the Mash Profile card. The rest catalog and
// preset matrix are seed data; this module only sorts, validates, and applies
// them. Framework- and engine-free (guards A2 / A8a).
//
// Dough-in and total time are artifact-derived nodes
// (`mash.dough_in_target_temp_c`, `mash.total_time_min`).

import restDefinitions from "../../../data/seeds/mash-rests.json" with { type: "json" };
import scheduleDefinitions from "../../../data/seeds/mash-schedules.json" with { type: "json" };

const DEFINITIONS = Object.values(restDefinitions)
  .sort((a, b) => a.sequence - b.sequence)
  .map((rest) => Object.freeze({ ...rest }));

export const MASH_OUT_REST = DEFINITIONS.find((rest) => rest.rest_id === "mash_out");

export const CANONICAL_RESTS = Object.freeze(
  DEFINITIONS.filter((rest) => rest.rest_id !== "mash_out")
);

/**
 * Named preset matrix. Each preset lists the canonical `rest_id`s it enables.
 * Mash-out is independent user state and is never preset-controlled.
 */
export const MASH_PRESETS = Object.freeze(
  Object.fromEntries(
    Object.entries(scheduleDefinitions).map(([id, schedule]) => [
      id,
      Object.freeze(
        schedule.rests
          .filter((rest) => rest.enabled && rest.rest_id !== MASH_OUT_REST.rest_id)
          .map((rest) => rest.rest_id)
      ),
    ])
  )
);

/**
 * Human-readable labels for the preset dropdown (object order = menu order).
 */
export const MASH_PRESET_LABELS = Object.freeze(
  Object.fromEntries(
    Object.entries(scheduleDefinitions).map(([id, schedule]) => [id, schedule.name])
  )
);

// The combined saccharification rest is an alternative to the beta/alpha pair,
// not an additional step. The singles may coexist (a step mash); the combined
// rest never joins them.
export const AMYLASE_COMBINED = "beta_alpha_amylase";
export const AMYLASE_SINGLES = Object.freeze(["beta_amylase", "alpha_amylase"]);

/** Rest ids that must switch off when `restId` is enabled. */
export function conflictingRests(restId) {
  if (restId === AMYLASE_COMBINED) return AMYLASE_SINGLES;
  if (AMYLASE_SINGLES.includes(restId)) return [AMYLASE_COMBINED];
  return [];
}

const REST_BY_ID = new Map(DEFINITIONS.map((rest) => [rest.rest_id, rest]));

/** Look up a canonical rest definition by `rest_id`. */
export function getCanonicalRest(restId) {
  return REST_BY_ID.get(restId) ?? null;
}

/** Default duration for a rest, or null when the id is unknown. */
export function defaultDurationMin(restId) {
  return getCanonicalRest(restId)?.default_duration_min ?? null;
}

/** Canonical-order index for a rest_id (mash-out last). */
export function canonicalOrderIndex(restId) {
  return getCanonicalRest(restId)?.sequence ?? MASH_OUT_REST.sequence + 1;
}

function bookendRank(restId) {
  return restId === MASH_OUT_REST.rest_id ? 1 : 0;
}

/**
 * Sort rests into ascending "use" temperature order, mash-out pinned last,
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

/** True when every enabled rest has a use-temperature and a non-negative duration. */
export function isMashScheduleValid(enabledRests) {
  return (enabledRests || []).every((r) => {
    const hasTemp = typeof r.use_temp_c === "number" && !isNaN(r.use_temp_c);
    const hasDuration =
      typeof r.duration_min === "number" && !isNaN(r.duration_min) && r.duration_min >= 0;
    return hasTemp && hasDuration;
  });
}

/**
 * Apply a named preset to a rests array: flips `enabled` flags and seeds a
 * preset temperature/duration the first time a rest is enabled, without
 * clobbering a value the user has already set. Mash-out is left untouched.
 * Non-mutating.
 */
export function applyMashPreset(rests, presetId) {
  const schedule = scheduleDefinitions[presetId];
  if (!schedule) return rests;
  const presetRows = new Map(schedule.rests.map((rest) => [rest.rest_id, rest]));

  return rests.map((rest) => {
    if (rest.rest_id === MASH_OUT_REST.rest_id) return { ...rest };
    const preset = presetRows.get(rest.rest_id);
    if (!preset) return { ...rest };
    const shouldEnable = !!preset.enabled;
    return {
      ...rest,
      enabled: shouldEnable,
      use_temp_c:
        shouldEnable && rest.use_temp_c == null ? preset.use_temp_c : rest.use_temp_c,
      duration_min:
        shouldEnable && rest.duration_min == null ? preset.duration_min : rest.duration_min,
    };
  });
}
