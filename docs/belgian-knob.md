# The Belgian Knob — advisory sugar additions

The Belgian knob answers one question:

> To reach a target AA (or ABV) at the current apparent extract, how much
> 100 % fermentable sugar would be needed?

It is **advisory only**. It never mutates the recipe, never adds a sugar row,
and never calls the solver. It is a presentation-layer calculation on top of
the current solved state.

## Why it works

Sugar is fully fermentable (`fermentability_fraction = 1.0`). Adding sugar:

- increases original extract (OE)
- adds nothing to the malt-derived apparent extract (AE)
- widens the OE − AE delta
- raises AA and ABV

That is the Belgian dry-finish mechanism. It is a **horizontal move** in the
OE/AE plane: OE rises, AE stays, the ray through the point becomes flatter.

It is not dilution-driven. Dilution is a different mechanism and is not the
default advisory.

## Math

Let the current solved state be `(OE, AE)`. Hold AE.

Target AA `A_t`:

- `OE_t = AE / (1 − A_t)`
- `ΔOE = OE_t − OE`
- `S_add = S(OE_t) − S(OE)` where `S(oe)` is the extract mass at the batch
  volume: `S = 1000·(SG(oe) − 1)·V / 385.641`
- `m_sucrose = S_add / yield_sucrose`

The app uses sucrose yield `1.0` relative to the sucrose reference. The
external reference is ~46.21 ppg; the readout is in kg.

Target ABV `B_t`:

- solve the Cutaia relation for `OE_t` with `AE` fixed
- `S_add = S(OE_t) − S(OE)`
- `m_sucrose = S_add / yield_sucrose`

AA and ABV are two labels for the same move once AE is fixed. The default knob
is AA; ABV is shown alongside.

The °P steps are the conceptual move. The kg dose uses the app's extract model
so that it agrees with the solver's `S = γ⁻¹·1000·(SG − 1)·V`.

## Feasibility

- `A_t < AA_current` → `S_add < 0`; sugar cannot make the beer less dry.
- `A_t ≥ 1` → impossible.
- `A_t > yeast_cap` → sugar cannot exceed the yeast's limit; change the strain
  or use an enzyme.
- `B_t < ABV_current` → `S_add < 0`; sugar cannot lower ABV at fixed AE.
- A `B_t` whose implied `A_t` exceeds the yeast cap → infeasible, because the
  solver would clamp the AA and AE would drift upward.
- A missing batch volume → infeasible; the dose cannot be expressed in kg.

The advisory must say which condition failed, not silently return a number.

## Worked example

Current: OE 12.0 °P, AE 4.0 °P, AA 66.7 %, ABV ~5.5 %, 20 L.

Target AA 70.0 %:

- `OE_t = 4.0 / (1 − 0.70) = 13.33 °P`
- `ΔOE = 1.33 °P`
- `S_add ≈ 0.28 kg` of extract at 20 L
- sucrose mass = `0.28 / 1.0 ≈ 0.28 kg`
- AE stays 4.0 °P
- ABV rises with OE

The plotted point moves horizontally right; the new AA ray is flatter.

## Volume

Primary advisory holds AE °P and uses the solved cold volume. The volume effect
of a solid sugar addition is small and is documented as an assumption. A future
variant can hold batch volume and show the small AE drift.

The extract-to-°P mapping is mildly nonlinear, so re-evaluating a dosed recipe
drifts from the horizontal line by a few hundredths of a degree at normal
gravity and by ~0.1 °P at 18–20 °P. The advisory is a plan, not a re-solve; the
solver remains the authority.

## UI

- Default knob: **AA**.
- ABV is a readout.
- Copy: “Add X kg sucrose; OE 12.0 → 13.3 °P; AE 4.0 °P; AA 66.7 → 70.0 %;
  ABV 5.5 → 6.1 %.”
- Horizontal arrow from the current point to the target; the new ray is drawn
  flatter.
- No auto-apply. An explicit “Apply” action may be added later.

## What it is not

- Not an automatic sugar addition.
- Not a dilution calculator.
- Not a mash-schedule model.
- Not a replacement for changing yeast, grist, or target.

## Tests

- AA and ABV targets agree on the same `OE_t`.
- AE is unchanged by construction; OE expands to `OE_t`.
- Zero delta → zero dose.
- Negative sugar targets are reported infeasible.
- Targets above the yeast cap are reported infeasible.
- Applying the dose to the extract model reproduces the target within the
  nonlinearity tolerance (≤0.5 pp AA, ≤0.05 % ABV, ≤0.2 °P AE at ≤20 °P).
- The advisory does not mutate the recipe.
