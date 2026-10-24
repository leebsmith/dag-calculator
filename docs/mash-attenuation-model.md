# Mash attenuation estimate

The Mash Profile card reports an **advisory** apparent-attenuation (AA) estimate
for the current rest schedule. It is compared with the selected yeast's
catalogue attenuation. It does **not** feed the batch solver: the solver keeps
using `batch.apparent_attenuation`.

- Implementation: `frontend/src/views/mashAttenuation.js`
- Card wiring: `frontend/src/adapters/cards/mash.js`
- Parameters: `data/artifact.json` constants

## What it models

A duration-weighted effective conversion temperature, then the empirical
single-infusion temperature/attenuation rule. It is a *level 1* model: it
handles multi-rest schedules and ramps, but not enzyme denaturation history.

## Inputs

| Input | Source |
|---|---|
| Enabled rests, temperatures, durations | `mash.rests` |
| Ramp rate | `equipment.mash_heating_rate_c_per_min` (default `1 °C/min`) |
| Yeast baseline AA | selected yeast `attenuation_pct` |
| Reference temperature | `mash_attenuation_ref_temp_c` (`65 °C`) |
| Temperature coefficient | `mash_attenuation_temp_coefficient` (`0.029` per °C) |
| Conversion window | `mash_conversion_window_low_c` / `_high_c` (`60–72 °C`) |
| Advisory band | `mash_attenuation_band` (`0.05`, i.e. ±5 pp) |

Dough-in is not a rest. It is derived as the first enabled rest's temperature
(`mash.dough_in_target_temp_c`) and feeds the strike-water chain. Mash-out is an
optional rest but is **excluded** from the attenuation estimate: it is a process
step after conversion, and averaging its 76 °C hold would understate
attenuation.

## Algorithm

1. Take enabled rests with a finite temperature. Exclude mash-out and any
   legacy dough-in row.
2. Sort ascending by temperature. The model assumes ramps always heat.
3. Walk the sorted rests:
   - A rest inside the conversion window contributes a segment at its
     temperature for its duration. A rest inside the window with a missing
     duration makes the estimate unresolved.
   - A rest outside the window contributes nothing.
   - Between consecutive rests, clip the ramp to the conversion window. If the
     clipped span is positive, add a segment at the midpoint temperature for
     `(T_high − T_low) / ramp_rate` minutes.
4. Compute `T_eff = Σ(T_i · t_i) / Σ(t_i)`.
5. `AA = AA_ref · clamp(1 − κ · (T_eff − T_ref), 0, 1)`, with `κ = 0.029`
   per °C and `T_ref = 65 °C`.
6. Report `AA`, `Δ = AA − AA_ref`, and `± band`. The delta is highlighted when
   it exceeds the band.

If there are no conversion segments, no elapsed conversion time, no yeast
baseline, or a needed ramp has no positive rate, the readout is unresolved
(`—`).

## Parameters

| Symbol | Value | Meaning |
|---|---|---|
| `T_ref` | 65 °C | Reference temperature where the model returns the yeast baseline |
| `κ` | 0.029 /°C | Relative attenuation loss per °C above reference |
| window | 60–72 °C | Starch-conversion window; outside it contributes nothing |
| band | ±0.05 | Advisory tolerance in AA fraction (±5 pp) |
| ramp rate | 1 °C/min default | Equipment property; seeds carry 1.0 |

The coefficient is the multiplicative form of the familiar rule of thumb
(~2.2 percentage points per °C at a 75 % reference). It is an empirical
approximation, not a universal constant: malt, pH, calcium, and yeast strain
all shift the real curve.

## Worked example

Default single infusion: one enabled `beta_alpha_amylase` rest at 67 °C for
60 min; mash-out enabled but excluded. Yeast baseline 81 %.

- `T_eff = 67 °C`
- `AA = 0.81 · (1 − 0.029 · 2) = 0.763`
- Readout: predicted 76.3 %, baseline 81.0 %, Δ −4.7 pp, ±5 pp.

German Pils preset: beta-amylase 63.5 °C/30 min → ramp to 70 °C at 1 °C/min
(6.5 min, midpoint 66.75 °C) → alpha-amylase 70 °C/20 min.

- `T_eff = (30·63.5 + 6.5·66.75 + 20·70) / 56.5 ≈ 66.18 °C`
- `AA = 0.81 · (1 − 0.029 · 1.18) ≈ 0.782`

## Assumptions and limits

- **Duration is a weight, not saturation.** The model assumes each conversion
  rest runs to completion; a short rest is weighted less but is not penalized
  for incomplete conversion.
- **No enzyme history.** A 70 °C rest followed by 62 °C scores the same as the
  reverse. Denaturation is not modelled.
- **No malt, pH, calcium, or mash-thickness effects.**
- **Increasing ramps only.** Step-down and decoction schedules are out of
  scope.
- **Mash-out excluded.** Toggling mash-out does not change the estimate.
- **Yeast baseline required.** Without a selected strain the advisory is
  unresolved; the batch value is still shown for context.

The band is a fixed advisory tolerance because yeast catalogues generally do
not publish attenuation ranges.

## Future: level 2

A kinetic level would add first-order enzyme inactivation (β- and α-amylase
half-lives, Arrhenius or z-values) and a gelatinisation rate, making the model
order-dependent and allowing short-rest penalties and mash-out exposure. It
needs measured attenuation data across rest durations to calibrate; without
that data the extra parameters would be speculative. The segment builder is
the intended extension point: replace the weighted average with a fold over
segments.

## Tests

- `tests/frontend/mash-attenuation.test.js` — anchors, window clipping, ramp
  midpoints, mash-out exclusion, unresolved cases.
- `tests/frontend/mash-card.test.js` — card wiring, preset durations, baseline
  comparison, mash-out independence.
- `tests/frontend/engine.test.js` — `mash.rest_count` / `mash.shape`
  derivations.
