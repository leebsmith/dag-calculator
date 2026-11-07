# Rationalize the yeast surface

<!-- claims: proposed batch.yeast.attenuation_cap_pct -->

**Status:** proposed
**Scope:** yeast card, style attenuation duplication, attenuation schema key, Library range invariant; yeast picker as a separate second step.
**Gate:** `make generate`, `make check`, `make test`.

## Why

The yeast card now carries three unrelated jobs:

- choosing a strain,
- setting the batch attenuation target,
- explaining the attenuation model.

The model has also grown: published range, cap, derate, realized attenuation, binding constraint, STA1, POF, and above-cap cause. The current eight-column table and the long “Why derate?” disclosure do not give those facts a clear hierarchy.

Two confusing details remain:

- `attenuation_pct` is the solver cap but is labelled as if it were a typical value.
- The conditional range control depends on a hidden invariant: both endpoints exist and the cap equals the high end.

The Style card duplicates the cap and “Sugar lift above cap,” and the latter mislabels STA1-driven dextrin consumption as sugar.

## Locked decisions

1. **Keep the step order.** Equipment → Style → Yeast. No “select yeast” shortcut on the Style card.
2. **Style keeps a read-only attenuation outcome.** It does not own cap, derate, or above-cap diagnosis.
3. **Yeast owns the input and diagnosis:** published range, target/cap, derate, realized attenuation, binding constraint, above-cap cause, and STA1/POF facts.
4. **One per-batch control.** The range popover writes existing `batch.attenuation_derate_points`; no new target root.
5. **Range control is conditional:** both endpoints present and `attenuation_cap_pct == attenuation_high_pct`.
6. **Cap is the high end** when a range exists; the point-only fallback keeps the current numeric derate.
7. **Cap is autofilled/read-only in the Library** when both endpoints exist; save validation rejects an inconsistent cap.
8. **Full key rename:** `attenuation_pct` → `attenuation_cap_pct`, with a legacy read fallback for existing drafts and frozen valuations. Only two batches exist; do not rewrite frozen data.
9. **No STA1 model change.** `sta1: true` still means `d = 1`; above-cap is allowed and labelled by cause.
10. **Picker is step 2.** The yeast card/style work lands first.

## Step 1 — Yeast card and attenuation model

### 1.1 Rename the strain cap key

- Rename `batch.yeast.attenuation_pct` to `batch.yeast.attenuation_cap_pct` in the artifact yeast schema, seed builder, labels, report paths, tests, fixtures, and generated inventory/glossary.
- Keep `attenuation_low_pct` and `attenuation_high_pct` as display/provenance.
- Add a legacy read fallback: when a selection snapshot has no `attenuation_cap_pct` but has `attenuation_pct`, treat the old value as the cap. Cover drafts and frozen valuation reads.
- Do not rewrite frozen batches; the next draft save writes the new key.
- Rename UI wording from “Typical attenuation” to “Attenuation cap.”

### 1.2 Seed and clone range invariant

- Seed builder: when both endpoints exist, set `attenuation_cap_pct = attenuation_high_pct`; when neither exists, keep the point; reject or treat one-endpoint rows as point-only.
- Add a seed guard asserting every ranged seed has `cap == high`.
- Library clone editor:
  - entering both endpoints makes the cap field read-only/autofilled;
  - show “Cap follows the published high (92%)”;
  - with no range, cap remains editable;
  - save validation rejects a range whose cap differs from its high.

### 1.3 Rebuild the yeast card

Replace the current table with three layers:

1. **Selected strain**
   - name, manufacturer, form, flocculation, temperature;
   - badges: `mine`, `STA1+`/`STA1−`/`STA1?`, `POF+`/`POF−`;
   - published attenuation band;
   - **Change yeast…**.
2. **Batch attenuation**
   - target/cap, published range, derate arithmetic;
   - **Set attenuation…** popover only when the range invariant holds;
   - popover: range slider, Use/Apply, computed derate, cap;
   - point-only fallback: numeric derate input;
   - realized apparent attenuation;
   - binding constraint: mash / yeast cap / diastaticus;
   - above-cap row and cause, inferred from STA1 and sugar presence;
   - no row when nothing exceeds the cap.
3. **Help**
   - short inline hint: attenuation is a ceiling; mash/process can lower it; STA1+ can exceed it;
   - collapsible **How the attenuation target works** with the range, derate table, STA1, POF-is-unrelated note, and the no-hidden-inference statement.

Move flocculation, alcohol tolerance, temperature, recipes, source and notes into a collapsible **Strain details** section.

### 1.4 Style card

- Remove the duplicate **Malt attenuation cap** and **Sugar lift above cap** readouts.
- Keep a read-only attenuation outcome: apparent attenuation and the existing ABV/FG readouts.
- No navigation button or shortcut to Yeast.
- Do not duplicate the cap/derate control.

### 1.5 Tests

- Artifact/seed: cap key rename, high-end invariant, legacy fallback for a snapshot using the old key.
- Library: ranged clone autofills/read-only cap; inconsistent cap rejected; point-only cap editable.
- Yeast card: range control appears only for a valid range; popover writes derate; cap and realized readouts; binding constraint; above-cap cause.
- Style card: no duplicate cap/sugar-lift labels; read-only outcome remains.
- Report: attenuation chain uses the renamed cap path and still renders.
- Run `make generate`, `make check`, `make test`.

## Step 2 — Picker rationalization

- Keep search and the 50-row cap/counter.
- Replace the stack of filter-pill rows with a compact filter area: manufacturer, attenuation tier, STA1 tier, POF tier. A disclosure or two compact rows, not five full-width rows.
- Rows show: name + `mine`/STA1/POF badges, manufacturer, published attenuation (point or band), temperature, **Use**.
- Move flocculation and tolerance to optional row detail.
- Keep no Copy; cloning remains a Library action.
- Tests: filters compose, POF/STA1 badges appear only as specified, `Use` selects and snapshots, result counter/truncation unchanged.
- Run `make check`, `make test`.

## Out of scope

- Changing `sta1` from `d = 1` to a bounded diastaticus ceiling.
- A new per-batch attenuation target root.
- Reordering the steps or adding a Style shortcut.
- POF value backfill or seed positives.
- Library clone/paging work already shipped.
- Changing the yeast picker before step 2.

## Verification

1. `make generate` after the artifact/seed/labels change.
2. `make check`.
3. `make test`.
4. Manual: select the M31 clone, open Set attenuation, choose 88%, confirm cap 88 and realized/above-cap display; choose 92% and confirm the STA1 cause label; check the point-only fallback on a non-ranged strain.
