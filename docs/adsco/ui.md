# ADSCO UI model

Status: **locked** (reconciled). Supersedes the vendored UI passages where they
differ; decisions are recorded in `plans/adsco-contract.md` (§ Locked decisions
7-11).

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
Calcium    12.0     (Auto)   52.4            —       Auto
Sulfate    15.0     250      250.0           0       Target
Alkalinity 35.0     (Auto)   35.0            —       Auto
```

- The Target column is **the constraint the routed mode posed**, never the stored
  root value. A floated ion shows `(Auto)` even when `water.target.<ion>` holds a
  dormant number.
- Status vocabulary: `Target` (hard equality), `Buffer` (Mode 2 alkalinity — a
  pre-acid minimum, so its Δ is expected to be non-zero), `Best fit` (Mode 3
  least squares — every ion is targeted, none is held exactly), `Auto` (floated).
- `Δ = post − target` is only meaningful for held ions; floated rows render `—`.
- Driven by `post_dose_mash_ions` vs `target`, with the pin sets mirrored in
  `frontend/src/views/registry/water.js` and pinned to the solver by
  `tests/conformance/fixtures/ion-constraints.json`.

## Mode 5 pin modal

- Pin **one to four** ions. The rule is stated in the modal, together with the
  reason: four keeps a degree of freedom for the salt optimiser.
- The modal must not promise success. Salts only add, so a pin the source already
  meets forbids every salt that adds it; the solve reports
  `PINNED_TARGET_BELOW_SOURCE` instead of reaching the target.
- Ticking a fifth ion is disabled; unticking the last one is disabled.

## Profile picker labels

Reference pickers render the component's name, never its raw id, plus a
constraint tag using the shared vocabulary:

| Mode | Option tag |
| --- | --- |
| 1 | `SO₄/Cl held` |
| 2 | `SO₄/Cl/alk held` |
| 3 | `all six, best fit` |
| 4 | `no salt targets` |
| 5 | `you pick ≤ 4` |

The hint under the picker states that applying a profile resets its derived
targets and returns the routing to `AUTO`.

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
