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
- `S_add = OE_t − OE`
- `m_sucrose = S_add / yield_sucrose`

The app uses sucrose yield `1.0` relative to the sucrose reference. The
external reference is ~46.21 ppg; display the result in kg.

Target ABV `B_t`:

- solve the Cutaia relation for `OE_t` with `AE` fixed
- `S_add = OE_t − OE`
- `m_sucrose = S_add / yield_sucrose`

AA and ABV are two labels for the same move once AE is fixed. The default knob
is AA; ABV is shown alongside.

## Feasibility

- `A_t < AA_current` → `S_add < 0`; sugar cannot make the beer less dry.
- `A_t ≥ 1` → impossible.
- `A_t > yeast_cap` → sugar cannot exceed the yeast's limit; change the strain
  or use an enzyme.
- `B_t < ABV_current` → `S_add < 0`; sugar cannot lower ABV at fixed AE.
- `B_t` above the Cutaia maximum for the current AE → infeasible.

The advisory must say which condition failed, not silently return a number.

## Worked example

Current: OE 12.0 °P, AE 4.0 °P, AA 66.7 %, ABV ~5.5 %.

Target AA 70.0 %:

- `OE_t = 4.0 / (1 − 0.70) = 13.33 °P`
- `S_add = 13.33 − 12.0 = 1.33 °P` of extract
- sucrose mass = `1.33 / 1.0` in the same extract units
- AE stays 4.0 °P
- ABV rises with OE

The plotted point moves horizontally right; the new AA ray is flatter.

## Volume

Primary advisory holds AE °P. The volume effect of a solid sugar addition is
small and is documented as an assumption. A future variant can hold batch
volume and show the small AE drift.

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
- AE is unchanged; OE expands by `S_add`.
- Zero delta → zero dose.
- Negative sugar targets are reported infeasible.
- Targets above the yeast cap are reported infeasible.
- Applying the dose in a test fixture and re-solving reproduces the target
  within tolerance.
- The advisory does not mutate the recipe.
