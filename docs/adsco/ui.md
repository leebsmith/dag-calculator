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

## Target selector

One select decides which ions the solver must satisfy. Routing is *derived* from
the checked set; there is no separate mode control and the UI never writes
`AUTO`.

| Selection | Checked ions | Values | Route |
| --- | --- | --- | --- |
| No targets | none (locked) | cleared | BASELINE |
| A preset | the preset's ions | the preset's values | derived from the set |
| Freeform entry | none at first | cleared | derived as ions are checked |

- The checkbox means **target this ion**: checked ⇒ the solver holds or optimises
  it. Unchecking clears that cell.
- Presets are value bundles: selecting one clears every value, checks its ions
  and fills them. Editing the checked set detaches the preset (the selector then
  reads Freeform); editing a held value keeps it.
- No targets is enforced — the checkboxes are disabled. Freeform is the compose
  state, starting empty.
- The checked set is stored in `water.pinned_ions`; `water.strategy` is derived
  from `checked ∩ has-value`: {} → BASELINE, {SO₄,Cl} → CALCIUM_FLOOR,
  {SO₄,Cl,alk} → HYBRID, all six → OPTIMIZE, anything else → CUSTOM with those
  ions as pins.
- A checked ion with no value is excluded and hinted (`no target entered`); it is
  never sent as a zero target.

## Target vs actual grid (the hero)

One row per ion, with the Target checkbox and value in the same table:

```
Target  Ion         Source  Target value  Post-addition  Δ      Status
[x]     Calcium     12.0    60            72.4           +12.4  Target
[ ]     Sulfate     15.0    (Auto)        250.0          —      Auto
[ ]     Alkalinity  35.0    (Auto)        35.0           —      Auto
```

- Checked + value: the cell is an input; that ion is a constraint.
- Unchecked: the cell reads `(Auto)`; the ion floats.
- Checked + empty: `No value` status with a hint; excluded from the solve.
- Status vocabulary: `Target` (hard equality), `Buffer` (alkalinity held via the
  agent, so its Δ is expected to be non-zero), `Best fit` (all six — least
  squares, nothing held exactly), `No value` (unfinished entry), `Auto` (floated).
- `Δ = post − target` is only meaningful for held ions; floated rows render `—`.
- The line under the grid names the route: `Targets: SO₄/Cl (2) — exact`,
  `Targets: all six — best fit, nothing held exactly`, `No targets — baseline`.
  Five checked is allowed but flagged `exactly determined, may be infeasible`.

## Preset labels

Options lead with the constraint set and name the style as an example:

| Selection | Label |
| --- | --- |
| preset `hoppy-ipa` | `SO₄/Cl — Hoppy / IPA` |
| preset `dark-stout` | `SO₄/Cl/Alk — Dark / Stout` |
| preset `soft-pilsner` | `All six — Soft Pilsner` |
| pseudo | `No targets — no ion targets` (first) |
| pseudo | `Freeform entry — compose your own set` (last) |

Presets are sorted by constraint-set size, then label. A profile record targets
the ions it declares a number for (`null` floats).

## Telemetry

- **Route line**: one line under the grid — the target set and its exactness.
- **Audit log**: collapsible drawer grouped by category; INFO collapsed, NOTE
  neutral, WARNING/ERROR surfaced. Host-side only (never a DAG output).

## Brew-day prescription

Unchanged two-destination checklist (mash grist / HLT after top-up), now fed by
the corrected pH and the full dose (salts + agent + acid).

## Guardrails / a11y

- Named handlers, `fmt.*` for all numbers/deltas, no inline logic (A8/A10),
  explicit `:selected` on any select, keyboard/aria for the target checkboxes
  and the target inputs.
- Thresholds aligned: Na 0–50, Cl 0–300, SO₄ 400, Mg 50.
