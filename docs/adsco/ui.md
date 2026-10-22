# ADSCO UI model

Status: draft for review. Locked UI decisions from the reconciliation.

## State model — one source of truth

- **Mode**: `water.strategy` (radio), the only persisted mode selector.
- **Target values**: six editable roots `water.target.<ion>`.
- **Calcium floor**: `water.target.calcium_floor_ppm` (or its root), editable.
- **Mode-5 pins**: `water.pinned_ions` collection.
- **Template**: a quick-fill affordance, **not** persisted selection. Applying a
  template sets mode + values + floor, then becomes inert; the dropdown shows a
  `(Modified)` marker when any value diverges from the applied template, and
  resets to "Custom / None" if the user switches the radio manually.

## Recompute

No "Solve" button. The live DAG recomputes on every edit, debounced through
`boundaryRunner`. Invalid/incomplete states surface as live warnings and a
pending/error boundary status, never a blocked submit.

## Mode radios

Five radios, each enabling only its relevant inputs and floating the rest:

| Radio | Editable | Floated |
| --- | --- | --- |
| 1 Flavor Balance (SO₄/Cl) | SO₄, Cl | Ca, Mg, Na, Alk |
| 2 Ratio + Dark Beer Buffer | SO₄, Cl, Alk | Ca, Mg, Na |
| 3 Classic Clone (all 6) | all six | none |
| 4 Baseline (no targets) | none | all six |
| 5 Custom Permutation | modal-selected | unchecked |

Locked inputs render muted with a lock glyph and an "(Auto)" placeholder; their
underlying value floats to source in the solver (no `None`/`0` sentinel through
the DAG — pinning is mode-driven, not value-driven).

## Target vs actual grid (the hero)

Immediately below entry, one row per ion:

```
Ion        Source   Target   Post-addition   Δ       Status
Calcium    12.0     (Auto)   52.4            —       Floor ≥ 50
Sulfate    15.0     250      250.0           0       Exact
Alkalinity 35.0     (Auto)   35.0            —       Floating
```

- `(Auto)` for floated ions; signed Δ for targeted ions.
- Status chips: Exact / Floor / Buffer / Floating / Compromise / Below-buffer.
- Driven by `post_dose_mash_ions` vs `target`, plus per-ion constraint state from
  telemetry.

## Telemetry

- **Banner**: one line — resolved mode + objective + worst severity.
- **Audit log**: collapsible drawer grouped by category; INFO collapsed, NOTE
  neutral, WARNING/ERROR surfaced. Host-side only (never a DAG output).

## Brew-day prescription

Unchanged two-destination checklist (mash grist / HLT after top-up), now fed by
the corrected pH and the full dose (salts + agent + acid).

## Guardrails / a11y

- Named handlers, `fmt.*` for all numbers/deltas, no inline logic (A8/A10),
  explicit `:selected` on any select, keyboard/aria for radios and the modal.
- Thresholds aligned: Na 0–50, Cl 0–300, SO₄ 400, Mg 50.
