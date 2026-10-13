---
title: Unit Scaling (scale families + auto-display)
step: future
program: deterministic-dag-calculator
target_repo: ~/Development/dag-calculator
depends_on: []
blocks: []
gate: —
status: exploration
---

# Unit Scaling — scale families + auto-display

Forward-looking exploration. Split today's single "unit" notion into **scale**
(pure multiple of the base) vs **conversion** (cross-system), and add systematic
**scale families** (S1) plus magnitude-based **auto-display** (S2). No SI rebase.

## Conceptual model

- **Scale** — a pure multiple of the base (linear, factor only): `g`/`kg`, `ml`/`L`,
  `s`/`min`/`hr`/`day`. Same quantity, different magnitude.
- **Conversion** — cross-system: `lb`, `gal`, `°F`, `Plato`, `EBC` (affine /
  nonlinear / different measurement system).

Both already live in `dimensions[dim].units` with their transforms; the engine
still computes in base. "Scale" is a **presentation** concept layered on the
existing factors — it does not touch the engine or frozen data.

## S1 — scale families (declaration)

A **family** = an ordered, ascending ladder of scale-units for a dimension,
optionally tagged by measurement system:

```
time:        { neutral:  ["s","min","hr","day"] }
mass:        { metric:  ["mg","g","kg"], imperial: ["oz","lb"] }
volume:      { metric:  ["ml","L"],     imperial: ["floz","pt","qt","gal"] }
temperature: { metric:  ["degC"],        imperial: ["degF"] }
```

Replaces the flat `UNIT_DIMENSIONS` list (which mixes systems and is not
magnitude-ordered). Factors stay in the artifact; the family names the ladder +
order + symbols.

## S2 — auto-scaling display

- **Readouts: auto-select.** From the field's active family, pick the rung whose
  displayed magnitude is human — e.g. *largest rung where |v| ≥ 1* — clamped to
  the ladder ends, with per-rung precision. `0.002 kg → "2 g"`, `90 min →
  "1.5 hr"`, `2000 g → "2 kg"`.
- **Inputs: fixed unit, not auto.** Auto-scaling while typing is hostile. Inputs
  use a fixed display unit (registry `displayUnit`) and convert on read/write —
  the same per-column cell conversion chosen for the dry-hop step (decision b).

## Resolution precedence

```
unitMode[field.id]              # explicit per-field override
  → unitMode[field.dimension]   # per-dimension default (may be "auto")
    → registry displayUnit      # fixed per-field unit (inputs)
      → auto-scale (readouts)   # S2
        → base unit
```

`"auto"` is a sentinel value of `unitMode`, so a user can opt a dimension/field
into auto-scaling.

## Impact (files)

- `views/registry/units.js` — replace `UNIT_DIMENSIONS` with `SCALE_FAMILIES`.
- `views/producer.js` — `valuate`: resolve `"auto"`/readout scale by magnitude.
- `adapters/stepAdapter.js` — `toggleFieldUnit` cycles within the active family.
- `store/unitPrefs.js` — sanitize accepts `"auto"` + family members.
- `partials/step-card.html` — generalize (b) cell conversion to all number inputs.
- Artifact / `engine/units.js` — unchanged if families live in the registry.

## Staging

1. **S1** — introduce families (registry), no behavior change; wire the toggle.
2. **(b)-generalization** — fixed-unit input conversion everywhere.
3. **S2** — opt-in auto-scale for readouts; then flip defaults if desired.

## Open questions

1. **Location** — families in the **registry** (presentation; no artifact change,
   no schema bump) vs the **artifact** (domain; `scales` per dimension, bump)?
   Leaning registry.
2. **System model** — do families carry a metric/imperial tag (future global
   system mode), or unlabeled magnitude ladders for now? Leaning unlabeled.
3. **Auto rule** — *largest rung with |v| ≥ 1*, per-rung precision, clamp ends;
   how to treat 0/negatives (base unit?)?
4. **Auto default** — opt-in (`"auto"` sentinel) first, then decide defaults?
5. **Input conversion scope** — generalize the dry-hop (b) cell conversion to all
   number inputs now, or keep it collection-only until later?
