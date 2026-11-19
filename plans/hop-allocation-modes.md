---
title: Hop allocation modes — IBU split and one mass pool
status: implemented (model, card strip, report table)
program: deterministic-dag-calculator
target_repo: ~/Development/dag-calculator
depends_on: [plans/hop-oil-model.md]
blocks: []
gate: make check + make test; identical inputs produce identical masses in both modes, and a row with no share adds no mass rather than a guessed one
---

<!-- claims: proposed batch.hop_allocation_mode batch.hop_mass_parts_total batch.hop_boil_mass_share batch.hop_hot_mass_share batch.hop_cool_mass_share solver.hops.whirlpool_hot_mass_kg solver.hops.whirlpool_cool_mass_kg batch.hop_scale -->

# Hop allocation modes — IBU split and one mass pool

**Built.** The model, the card's stage strip, the report's allocation table and
the lossless mode switch landed as specified. Two deviations from the draft:
the mode selector sits in the Style card next to `Bitterness allocation` (where
the slider it replaces already lived, rather than in the hops card), and the
report prints one allocation table in both modes instead of gating on the mode,
so the authored-pool bullets below it are derived rather than assumed. §10's
open questions are settled: `mass_parts` seeds from the solved masses, the strip
shows in both modes, and the labels are "Two pools / One pool".

**What this is:** a second way to author a hop bill, beside the one that exists.
Today the style card splits the IBU target into a boil pool and a whirlpool pool,
and each table's `parts` are shares of its own pool. The new mode collapses the
pools into one: the brewer authors a mass *share* per addition, the total IBU
target scales the whole bill, and the stage IBU split becomes a readout.

Both modes ship. The existing one is the default, so every stored batch and the
import path keep their current meaning without a migration.

## 0. Why this, and not oil-driven allocation

The pairing and synergy work belongs to an external notebook, not to this app. The
recommendation document behind that conclusion needs per-compound data this repo
deliberately does not carry (β-pinene, limonene, selinenes, epoxides, esters,
thiols) and two uncalibrated terms — an interaction matrix and a target-cosine
band — that no source publishes. Shipping a score built from those would be a
derived value dressed over an authored guess, which `docs/vision.md` refuses.

The chemometric case, and the data it would need, is written up in
`docs/hops/reference/hop-synergy-reference.md` — background, not a contract.

What the app can do exactly, and a spreadsheet cannot, is scale a bill to a
specific kettle: gravity, volume, boil time, cooling curve, product form and
alpha. So the app owns the *physical* bill and the notebook owns the
*sensory* choice, and the interchange between them is percentages — dimensionless,
portable, and free of someone else's batch assumptions.

## 1. The model

### 1.1 Two modes, one budget

| | `ibu_split` (existing, default) | `mass_pool` (new) |
|---|---|---|
| Budget | `batch.target_ibu`, divided by `batch.whirlpool_ibu_fraction` into stage pools | `batch.target_ibu`, undivided |
| Authored per row | `parts` — share of its stage's **IBU** pool | `mass_parts` — share of the **hot-side mass** |
| Derived per row | `pct` | `mass_pct` |
| Mass | `mass_i = IBU_i / (alpha_i × util_i)` | `mass_i = mass_pct_i × M` |
| Stage IBU split | authored | emergent |
| Stage mass split | emergent | authored |

The hot side is **boil + hot whirlpool + cool whirlpool** — every pre-fermentation
addition. The cool stand contributes IBU (small, not zero: the 79 °C
isomerization floor classifies a charge, it does not switch isomerization off),
so it belongs inside the pool. Dry hops are outside both modes: they carry no IBU
and are authored by mass.

### 1.2 The solve is one division

IBU is linear in mass in both stages — Tinseth for the boil, the cooling integral
for the whirlpool — and utilisation depends on time, gravity, temperature and
form, never on mass. So for each hot-side row:

```
k_i     = alpha_i × util_i × form_i × 7489 / volume_gal     (boil)
        = alpha_i × util_i(t_eff) × form_i / V_L × 1000      (whirlpool, per §5)
mass_i  = mass_pct_i × M
target  = Σ IBU_i = M × Σ (mass_pct_i × k_i)
M       = target_ibu / Σ (mass_pct_i × k_i)
```

Closed form, no iteration, exactly A9-clean. Percentages are invariant under M, so
the weight the brewer authored survives any change of volume, gravity or target;
only the grams move.

Edge cases, each answered rather than defaulted:

- **No hot-side rows, or every share zero:** `Σ (mass_pct × k) = 0`. Refuse with
  the existing `INVALID_HOP_INPUT` rather than report an infinite mass.
- **A row with no share:** it adds no mass and no IBU. The card hints which rows
  those are; the solver does not guess a share.
- **Zero alpha, unknown form, null cone utilisation:** the existing per-row codes
  (`INVALID_HOP_INPUT`, `UNKNOWN_PRODUCT_FORM`, `CONE_UTILIZATION_REQUIRED`) keep
  firing per row, before the scale.
- **Rounding:** shares normalise from `mass_parts` by sum; the last row is not
  forced to absorb a residual, because the solve does not require the shares to
  sum to any particular number.

### 1.3 What the two modes share

`_split_ibu` still classifies each whirlpool charge by `initial_temp_c` against the
isomerization floor. In `ibu_split` it reports how the authored pools landed; in
`mass_pool` it reports what the masses produced. Either way the boundary returns
`whirlpool_hot_ibu` and `whirlpool_cool_ibu`, so the strip and the report read
the same source in both modes.

The stage **mass** split is new output, and it is mode-independent: masses exist in
both modes. `solver.hops.whirlpool_hot_mass_kg` and `solver.hops.whirlpool_cool_mass_kg`
join `boil_mass_kg` and `whirlpool_mass_kg`, and the three stage shares are derived
from them.

## 2. The user's workflow

1. Roots first: volume, grain bill (pre- and post-boil gravity), boil time, cooling
   curve. Masses cannot exist without them, in either mode.
2. Style card: author `batch.target_ibu`; choose the allocation mode.
3. Hops card: add the charges — variety, form, alpha, time, and for the whirlpool
   the post time and temperature. The 79 °C floor sorts hot from cool; nothing new
   to set.
4. In `mass_pool`, type the shares. A notebook that prints grams can be entered
   as-is — the unit cancels — but one unit throughout, or the shares are wrong.
5. Read the stage strip. Move shares to shift the split; the bill re-scales.
6. Dry hops stay grams, outside the pool.

## 3. UI

### 3.1 Where the mode lives

In the **Style card**, beside the control it replaces: the "Bitterness allocation"
range slider. That slider is the existing split's only authoring surface, and
putting the mode next to it keeps allocation in one place instead of splitting it
across two cards.

```
Style → targets
  Target IBU            [────────●──────────]  70.4 IBU
  Hop allocation        [ Two pools ▾ ]        ← new
  ── two pools ───────────────────────────────────────────────
  Bitterness allocation [──────●─────────────]  25 % whirlpool
                        Boil 52.8 IBU · 25 % whirlpool · 17.6 IBU
  ── one pool (kettle + whirlpool) ───────────────────────────
  Whole 70.4 IBU is one pool; the stage split is emergent.
  Boil 54.7 · Hot WP 11.7 · Cool WP 4.0        (77.7 / 16.6 / 5.7 %)
```

The mode is a batch root, so it travels in the batch record, the import projection
and the frozen report.

### 3.2 The stage strip

One element, shown in **both** modes, because mass shares exist in both. Only the
note changes: which split was authored.

```
STAGE                       SHARE      MASS      IBU     IBU %
Boil                        24.7 %    26.7 g      ?        ?
Hot WP                      28.0 %    30.3 g      ?        ?
Cool WP                     28.7 %    31.1 g      ?        ?
──────────────────────────────────────────────────────────────
Hot side (kettle + WP)       100 %   108.4 g     70.4     100 %
Dry hop                 34 % of bill   56 g       —        —
```

The footer spells out its own scope: "Hot WP" is a stage and "hot side" is the
whole pre-fermentation pool, and the two must not be read as the same thing.

### 3.3 The tables

Same two tables; their rows genuinely differ (boil time versus post time and
temperature). What changes is the share column:

- `ibu_split`: header **Parts**, values are IBU shares, footer counts the stage's
  parts.
- `mass_pool`: header **Share**, values are `mass_parts`, footer shows the share of
  the *hot side* — the pool spans both tables, so a per-table total would imply two.

Copy switches with the mode, as `fermentables-sugar-section.html` already does for
`late_addition_intent`:

- "Author by IBU share; the hop mass is back-calculated from Tinseth."
- "Author by mass share; one hot-side pool sets the scale."

## 4. Switching modes

Two columns, so nothing is reinterpreted:

- `parts` is never rewritten. Flipping `mass_pool → ibu_split` restores the old
  bill exactly.
- Entering `mass_pool` seeds each hot-side row's `mass_parts` from the batch's
  **current solved masses** (`mass_i / Σ mass`). The bill does not jump: the
  masses that produced `target_ibu` yesterday produce it today, because the old
  masses already summed to the target.
- If the batch has never been solved (no gravity yet), the seed is empty and the
  card says so rather than inventing shares.

No data migration, no model version. `ibu_split` is the default for every batch
that has not chosen.

## 5. What changes

### 5.1 Artifact (`data/artifact.json`)

- `batch.hop_allocation_mode` — `choice`, taxonomy `hop_allocation_mode`
  (`ibu_split`, `mass_pool`), default `ibu_split`.
- `mass_parts` and derived `mass_pct` on `boil_hop_row` and `whirlpool_hop_row`.
- `batch.hop_mass_parts_total` — sum of `mass_parts` across both hot-side
  collections, the pool denominator.
- Stage shares: boil / hot / cool, derived from the solver's stage masses.
- `batch.hop_scale` — the solved M, exposed so the report can explain a jump in
  grams without re-deriving it.
- Retirement from the driver path (fields stay, nothing reads them in `mass_pool`):
  `batch.whirlpool_ibu_fraction` and the two stage targets remain authored/derived
  for `ibu_split` only, and the card hides them in `mass_pool`.

### 5.2 Solver (`backend/app/core/hop_solver.py`)

- `HopSolverInput` gains the mode and each row's `mass_parts`.
- New path: compute `k_i` per row from the existing utilisation functions, then the
  single division. The per-row `mass_from_ibu` inverse is retained for `ibu_split`
  and for nothing else.
- New outputs: `whirlpool_hot_mass_kg`, `whirlpool_cool_mass_kg`.
- `HopSolverResult` gains the solved scale.
- `backend/app/schemas/boundary.py` mirrors the inputs and outputs.

### 5.3 Frontend

- `views/producer/boilPolicy.js`, `whirlpoolPolicy.js`: seed `mass_parts: null`.
- `views/producer/hopRows.js` or a new pure module: the stage strip's numbers.
- `views/producer/hopOil.js`: untouched — the oil charge rides on solved masses and
  works in both modes.
- `views/steps.js`: mode-aware table configs (which share column is a column, which
  is hidden).
- `adapters/cards/hops.js` + the style targets card: the mode selector, the strip,
  the copy switch, the zero-share hint.
- Store: the seed-on-switch action.

### 5.4 Report

`sections/hops.typ` gains an **Allocation** block where "IBU Splits" is today: the
stage table in both modes, plus a note naming which split was authored. It needs
the two new per-side mass outputs and their formatted nodes, so the bundle fixture,
`sections.json`, `docs/report-sections.md` and the glossary all regenerate.

## 6. Tests

- **Solver**: shares are preserved exactly under a scale change (volume, gravity,
  target); `Σ IBU = target` to floating tolerance; a zero-share row adds nothing; a
  bill of all-zero shares refuses; `ibu_split` output is byte-identical to today for
  the same inputs; both modes return the same stage-mass split for a bill whose
  masses coincide.
- **Artifact**: every new node has a consumer (`artifact-consumers`); the new
  choice's taxonomy covers both members (`taxonomy-coverage`).
- **Rows**: the makers seed only declared fields (`hop-row-schema`).
- **Frontend**: mode switch seeds `mass_parts` from solved masses and leaves `parts`
  untouched; switching back restores masses; strip numbers for a known bill; copy
  switches with the mode.
- **Import**: a BeerXML import still projects to `ibu_split`.
- **Report**: fixture regeneration plus `describe-bundle` and `report-sections-sync`.

## 7. Rejected alternatives

- **Oil-share allocation** (the tabled direction): the oils are a readout, and the
  sensory judgement belongs to the notebook. `parts` would also have had to change
  meaning, which the tabled plan itself called out as the blocker.
- **Authoring absolute grams**: the notebook's grams belong to the notebook's batch.
  It would also author a mass to obtain a target, which `docs/vision.md` §5 refuses.
- **One `parts` field with a mode-dependent denominator**: two meanings for one
  number, and the denominator is what the name is supposed to carry.
- **Three authored pools** (boil / hot / cool with an authored hot fraction): over-
  determined against authored mass shares, and it needs a per-row stage field the
  temperature already provides.

## 8. Answers to the tabled layering plan

`plans/hop-layering-strategy.md` asked seven questions before any build. This plan
answers them: (1) authored in the Style card, beside the slider it replaces;
(2) N hops with shares, not a pair ratio; (3) `parts` keeps its IBU meaning and the
new column carries the mass share; (4) a mode select plus one strip, not two
numbers that must sum; (5) oil stays per table, unchanged; (6) the UI says weight,
and the oil line remains a charge, never a flavour claim; (7) an unpriced hop is
unchanged for oil, and its allocation analogue is a zero-share row, surfaced as a
hint.

## 9. Documentation updates

Ordered, because `tests/guards/docs-claims.test.js` resolves every backticked dotted
token in a living doc against the artifact:

1. **Artifact first**, same commit as the code. The new ids exist before any living
   doc may name them.
2. `docs/hops/whirlpool-hopping-model.md` — §5 gains the one-pool path beside the
   inverse; "the hops card authors by IBU share" becomes mode-aware; "IBU splits"
   explains authored-versus-emergent; the new per-side mass outputs are listed with
   the other boundary outputs.
3. `docs/adsco/ui.md` — a `### Hop allocation mode` subsection beside
   `### Late-addition intent`, covering the select, the strip, the share column and
   the zero-share hint.
4. `docs/style-conformance.md` — the sentence that assumes one authoring mode.
5. `plans/hop-oil-model.md` — one line: allocation is mass shares, and the oil
   charge stays a readout.
6. `docs/vision.md` — §5 item 7 gains the distinction between an authored mass and
   an authored share; a new item refuses sensory scoring outright and names the
   notebook as its home.
7. `TODO.md` — the two oil-allocation bullets retire.
8. Generated: inventory, report sections, glossary, dot/svg, bundle fixture.

## 10. Settled

- A freshly added row's `mass_parts` is `null` and the card counts it, rather than
  seeding an even split the brewer did not author.
- The strip shows in both modes: the masses exist either way, and only the source
  of the stage split differs.
- Mode labels are "Two pools (boil / whirlpool)" and "One pool (kettle +
  whirlpool)"; the footer row is "Hot side (kettle + WP)" so a stage name never
  reads as the pool name.
