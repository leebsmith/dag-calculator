# Mash attenuation estimator removed

**Status:** removed
**Supersedes:** the level-1 advisory estimate added in `691e93b`

## Decision

The mash-schedule attenuation advisory was removed. It used a duration-weighted
effective conversion temperature and the empirical single-infusion temperature
rule:

`AA = AA_ref · (1 − κ · (T_eff − T_ref))`

with `T_ref = 65 °C` and `κ = 0.029 /°C`, compared against the selected yeast's
catalogue attenuation.

## Why

Two independent problems:

1. **The baseline was misused.** A yeast catalogue attenuation (or a malt COA
   AAL) is measured under a standard/Congress-type program. It is not the
   attenuation of a 65 °C single infusion. Treating it as the 65 °C anchor
   produced absolute numbers that were not comparable to either source.

2. **The estimator cannot rank a Congress Mash correctly.** Running the
   Congress program through the conversion window:

   - 45 °C rest excluded (below the window)
   - ramp 60 → 70 °C = 10 min at 65 °C
   - 70 °C hold = 60 min
   - `T_eff = (10·65 + 60·70) / 70 = 69.3 °C`
   - predicted AA ≈ `0.81 · (1 − 0.029 · 4.3) ≈ 70.9 %`

   That is **below** a 65 °C single infusion, even though the Congress Mash is
   designed to yield the maximum fermentability. A time-weighted average cannot
   represent "beta works early, alpha works late." Normalising the same linear
   rule to the Congress schedule does not fix the ranking: the rule always
   favours cooler temperatures.

## What was removed

- `frontend/src/views/mashAttenuation.js`
- the "Attenuation Estimate" card and all associated card getters
- model constants (`mash_attenuation_*`, `mash_conversion_window_*`,
  `default_mash_heating_rate_c_per_min`)
- the ramp-rate equipment field and `temperature_delta_per_time` dimension
- `mash.rest_count`, `mash.middle_rest_count`, `mash.shape`, and the
  `mash_schedule_shape` taxonomy
- the living model doc

## What a replacement requires

- A reference schedule (Congress Mash) as the maximum-fermentability anchor.
- A per-enzyme score (β/α activity and inactivation), not a time-weighted
  temperature average.
- Normalisation so `S(Congress) = 1`, then `AA = AA_ref · S(schedule)`.
- Calibration data across rest temperatures, durations, and sequences.

Do not reintroduce the level-1 rule as an AA predictor.
