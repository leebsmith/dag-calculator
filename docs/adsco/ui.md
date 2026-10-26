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

## Card layout

The water card is four labelled regions, in this order:

1. **Water plan** — source report picker, target preset picker, calcium floor,
   target mash pH, the target-vs-actual grid, route line, kettle ratio, predicted
   mash pH/status, and actionable warnings. This is the primary decision surface.
2. **Treatment** — salt distribution, acid medium, gypsum and CaCl₂ forms, and
   the alkaline agent.
3. **Prescription** — dosing volume, residual HLT, nonzero mash/sparge additions,
   dosing-basis footnote, and destinations. A nonzero sparge acid dose carries the
   note `Sparge acid prescribed to keep sparge pH ≤ 5.80`; this is a prescription
   fact, not a warning, because the card assumes the plan is followed.
4. **Details** — collapsed full telemetry log, ratio basis, not-modelled caveat,
   and abnormal boundary status.

The source report picker carries identity only; source ions render solely in the
grid's Source column. Predicted pH/status lives in the Water plan and is not
repeated. The warning badge counts WARNING + ERROR telemetry entries and opens
Details; INFO and NOTE entries remain in the full log.

### Precision

| Quantity | Precision |
| --- | --- |
| Source, target, post-addition, Δ concentrations | 1 dp (Δ signed; zero `0.0`) |
| Mash pH readouts | 2 dp |
| Mass (g) | 1 dp |
| Volume (L) | 1 dp |
| Acid (mL) | 1 dp |
| Ratio | 1 dp; delta factor 2 dp |
| Editable inputs | natural value, no forced padding |

Additions that format to `0.0` at the chosen precision are suppressed. A vessel
with no additions reads `No mash additions` / `No sparge additions`; a vessel
with a mix adds `Only nonzero additions shown.`

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
  Six checked routes to best fit and warns that no individual target is
  guaranteed.

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

## Ingredient figures (attenuation)

The fermentables, late-addition, and trace tables show the **real** fermentable
share of extract. The figure carries a marker so an assumption is never rendered
as data:

| Marker | Meaning | Example |
| --- | --- | --- |
| *(none)* | captured, real basis, point value | `87.0%` |
| `≥` | the source published a minimum; the value is a floor | `≥87.0%` |
| `≈` | converted from an apparent figure at the fixed 12 °P reference | `≈63.5%` |
| `~` | assumed prior (no published figure) | `~64.3%` |

Markers compose (`≥≈63.5%` for a Dingemans minimum published as final
attenuation). The underlying value is the real fraction the solver consumes;
the marker is presentation only. A prior is stamped `kind: "prior"` in the row's
provenance, and the same marker applies to a prior yield.

The realized **FG** readout floors at SG 1.000 (0 °P in Plato): when apparent
extract is at or below zero (a diastaticus fermentation), the field displays
`≤ 1.000` / `≤ 0.0` rather than a sub-gravity number. The stored value is
unchanged; the conformance layer still sees the computed gravity.

### Late-addition intent

Late additions are authored either as a **dose** (mass) or as a **share** of
total post-boil extract. The mode is a batch-level control; switching it does
not discard the other representation:

| Mode | Editable | Read-only | Meaning |
| --- | --- | --- | --- |
| Dose | Mass | Resolved mass | the authored sugar mass feeds the solver's late extract |
| Share | Parts | Mass | parts weight the sugar-extract budget; the solver derives the share per candidate gravity |

The share root is bounded at 95 % and warns above 90 %. A share above zero with
no sugar rows raises the `sugar_share_without_sugar` advisory; it never silently
adds extract. The first dose → share switch seeds the share from the current
dose and the parts from each row's extract; afterward both authored states
round-trip. "Adopt current dose" and "Adopt share into masses" are explicit
re-sync actions, not implicit rewrites.

### Scale pin and preview matrix

The Late Additions card carries a collapsible **Pin preview** when sugar is
authored. It shows one row per scale pin — ABV, OG, FG — with the realized OG,
FG and ABV at that pin's persisted target:

| Pin | OG | FG | ABV |
| --- | --- | --- | --- |
| ABV | solved | solved | target |
| OG | target | solved | solved |
| FG | solved | target | solved |

The active row is the batch; the other two are hypothetical previews. Cells are
green inside the style envelope, red outside, and neutral without an envelope.
One backend preview call returns all three rows; it skips grist and cascade.
Previews are read-only; selecting a radio makes that pin active, and the active
target is edited in the panel. The composition representation is held fixed and
named above the table (`Previews hold 0.5 kg sugar extract` / `Previews hold 10 %
of extract`).

The panel expands when sugar is first authored and collapses when no sugar
contributes. The Late Additions card and its “Configure Sugars” button remain.
The Style card mirrors the active pin and target, owns the style reset, and
keeps the pin control reachable when the preview is collapsed.

Style conflicts are warnings, never freeze gates. The retired Belgian knob was
the special-case ABV-at-fixed-AE sugar advisory; the general ABV+FG
composition-solving mode is deferred.

### Sugar effect (late additions)

The Late Additions summary shows what the current sugar is doing **at the ABV
pin**, without asking the designer to unpin it:

| Readout | Meaning |
| --- | --- |
| Extract share | sugar extract ÷ total post-boil extract |
| ΔOG | gravity points added by the dose at the current kettle volume |
| ΔFG | `+0.000` — sugar is fully fermentable and leaves no residual extract |
| ΔABV | alcohol contributed by the sugar's extract share |
| Malt displaced | malt mass that would supply the same extract at the current grist yield |

The decomposition holds the solved apparent extract and removes the sugar's
extract share from OE. It is a host-side readout derived from the batch solve:
nothing is persisted, no root changes, and the ABV pin is untouched. It answers
"what is this sugar buying me?" — not a second solver result. In share mode the
sugar input is `batch.sugar_extract_total` (the solved budget), so the deltas
remain meaningful when the dose is derived rather than authored.

## Guardrails / a11y

- Named handlers, `fmt.*` for all numbers/deltas, no inline logic (A8/A10),
  explicit `:selected` on any select, keyboard/aria for the target checkboxes
  and the target inputs.
- Thresholds aligned: Na 0–50, Cl 0–300, SO₄ 400, Mg 50.

## Batch findings (planned)

Batch relations are enumerated, not summed into a bare badge. Each finding
shows its label, the two formatted operands (in the user's unit mode) and a
severity derived from the artifact's `blocking` flag: `error` = unbrewable on
this rig, `warning` = quality/policy. The footer count remains as a summary
badge only.

- **Diastaticus status** — a selected strain with no published STA1 result
  raises the `sta1_unknown` warning (not blocking): the model treats it as
  non-diastaticus, and the message names that assumption.
- **Sugar share** — a positive share with no sugar rows raises
  `sugar_share_without_sugar`; a share above 90 % raises `sugar_share_high`.
  Both are non-blocking advisories: they describe the authored intent, and the
  solve reports the truth of what was authored.
- **Capacity** — kettle, mash tun (peak of the mash and sparge phases) and HLT
  liquor demand report critically: the solve completes and every readout stays
  alive, but the batch cannot be frozen.
- **Mash thickness ceiling** — a policy warning when the resolved thickness
  exceeds 2.0 qt/lb (4.1727 L/kg). Because it is advisory, it never clamps.
- **Pin affordance** — a one-shot action inside that warning, visible only when
  the thickness is implied (`runoff_ratio`) and boundary status is `ok`. It
  writes `max(default_mash_thickness, equipment.min_lgr_l_per_kg)` to
  `batch.mash_thickness_l_per_kg` and disappears; it promises nothing about
  capacity. An authored thickness gets the warning, never a rewrite.
- **Freeze** — refused while the solve failed or any blocking finding stands;
  the refusal cites the finding.
