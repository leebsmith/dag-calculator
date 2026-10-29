---
title: Hop documents — folder, vocabulary, and the dry-hop card
program: deterministic-dag-calculator
target_repo: ~/Development/dag-calculator
depends_on: []
blocks: []
gate: make verify
status: shipped
---
<!-- claims: proposed batch.dry_hops.application_event batch.dry_hops.contact_until batch.dry_hops.contact_duration_min -->

# Hop documents — folder, vocabulary, and the dry-hop card

> **Shipped.** The folder, the index and the two vocabulary renames landed as
> described; the card shipped with the three axes, the `hop_application_event`
> and `hop_contact_until` taxonomies, and `contact_duration_min` replacing the
> misnamed `contact_duration_hours` (the `time` dimension stores base minutes).
> It was then rebuilt as a table plus a "Configure Dry Hops" editor over the hop
> and hop-product catalog — the inline form had no catalog and diverged from the
> other hop cards — and the catalogue drawers gained repeats (`allowDuplicates`).

## Problem

1. The hop prose is scattered: `docs/whirlpool-hopping-model.md` is the living
   contract, while `docs/hot-side-hopping-agent-dosing.md` is an unlisted
   generated transcript that declares itself background. The dry-hop material
   for the next card has no home at all.
2. `wet_hop_application_stage` and `wet_hop_product_type` are misnamed. Wet
   hopping is a boil addition of harvest-fresh whole cones; dry hopping is cold
   side, and whole cones are not available to this brewer. The names are
   consumed only by `dry_hop_row`, so they are cheap to fix now and expensive
   after a card is built on them.
3. `batch.dry_hops` renders through the generic collection table, which cannot
   express the three axes the schedule actually uses: application event,
   contact time, hop type.

## Decisions

- The vocabulary names the **brewing-process stage**, not a hop side.
  `hop_addition_stage` = `mash`, `boil`, `whirlpool`, `fermentation` — named for
  primary purpose, in process order. The hot/cold split is a view over those
  four values, not a stored fact: the artifact has flat taxonomies only.
- `hop_product_type` replaces `wet_hop_product_type` without whole cones
  (unavailable): `t90_pellet`, `lupulin_pellet`, `flowable_extract`,
  `terpene_isolate`.
- `whirlpool_hop_form` is **not** merged. It is pinned to the solver's
  `PRODUCT_FORM_UTILIZATION` map by equality
  (`tests/guards/taxonomy-coverage.test.js`), so it is a physics contract, not a
  vocabulary.
- Freezing is for verbatim snapshots (`docs/historical/`, the vendored
  `docs/adsco/` specs). The hop transcripts are **reference** material: the
  folder and the index give hierarchy, and the documents stay editable. No new
  frozen prefix, no `--no-verify`.
- The card is descriptive. The calculator has no fermentation model, so an
  application event or a contact-termination trigger records intent and must
  never be presented as a prediction.

## Commit 1 — name the hop vocabularies

`data/artifact.json`:

- delete `wet_hop_application_stage`, `wet_hop_product_type`;
- add `hop_addition_stage` (`mash`, `boil`, `whirlpool`, `fermentation`) and
  `hop_product_type` (`t90_pellet`, `lupulin_pellet`, `flowable_extract`,
  `terpene_isolate`);
- `dry_hop_row.product_type` cites `hop_product_type`;
- `dry_hop_row.application_stage` cites `hop_addition_stage` with
  `"default": "fermentation"` — `rowDefaults()` otherwise seeds the first
  taxonomy member (`mash`) into a new dry-hop row. The pattern already exists on
  `whirlpool_hop_row.product_form`.

`TODO.md` gains the card entry as `## Next` item 1 and the per-field taxonomy
subset follow-up under `## Later`. `make generate` re-emits
`docs/dag-artifacts/inventory.md`, `docs/report-bundle-glossary.md` and
`tests/conformance/fixtures/report-bundle.json`.

## Commit 2 — home the documents

```
docs/hops/
  README.md                                living index
  whirlpool-hopping-model.md               living contract (moved)
  reference/
    hot-side-hopping-agent-dosing.md       background (moved)
    dry-hopping-times-and-conditions.md    background (imported)
```

Each transcript carries a header: title, `status: background reference`, source
URL, retrieved date, and one line stating that it is a verbatim import, not the
contract, and that corrections belong in a living doc. Bodies are untouched.

The index is bibliographic: document, status, scope, closing rule that the
artifact and the model document win. Call sites retarget:
`whirlpool-hopping-model.md` (§7 and §9), the hot-side header line,
`backend/app/core/hop_solver.py` docstrings, `TODO.md` (two entries),
`plans/cooling-curve-determination.md`, the root `README.md` table, and
`AGENTS.md` (source of truth + layout).

Not touched: `plans/hop-math-promotion.md` (superseded), `plans/archive/**`,
`docs/historical/provenance.md` (frozen history that names the old taxonomies),
generated docs, `docs/dag-artifacts/**`.

## Commit 3 — the dry-hop card (TODO item 1)

Three axes, all descriptive:

| Axis | Field | Vocabulary |
| --- | --- | --- |
| application | `application_stage` + `application_event` | stage = `hop_addition_stage`; event = `hop_application_event` (`pitch`, `high_krausen`, `mid_fermentation`, `terminal`, `post_diacetyl`, `cold_crash`, `packaging`) |
| contact | `contact_duration_min` or `contact_until` | until = `hop_contact_until` (`terminal_gravity`, `vdk_clearance`, `hop_creep_plateau`, `biotransformation_equilibrium`, `next_charge`, `cold_crash`, `packaging`) |
| type | `product_type` | `hop_product_type` |

- `contact_duration_hours` is renamed `contact_duration_min`: the `time`
  dimension stores base minutes, so the old name was wrong about its own value.
  Both contact fields default to `null`; the card enforces "exactly one" because
  the artifact cannot (field `domain` is numeric bounds only, and `relations`
  are n-ary predicates over node values, not collection rows).
- Shape mirrors the hops card: `step-dry-hops.html` +
  `adapters/cards/dry-hops.js` (with `KEYS`) + an installer entry + the
  `editor.html` branch + the `views/steps.js` partial path + a registry entry for
  labels and `optionLabels`, then `node scripts/emit-ownership-index.mjs`.
- Duration is displayed in hours and written in minutes through the unit
  conversion (`displayValue` / `toBase`), never by hand.

## Verification

`make check`, `make test`, `make build`. Expected: taxonomy coverage passes
because both new taxonomies are cited by `dry_hop_row`; docs-claims passes on
the new living index; generated docs and the report fixture are byte-identical
after `make generate`; `tests/frontend/dry-hops-card.test.js` covers the add-row
defaults, the stage/event pairing, the contact mutual exclusion, and the
hours-to-minutes write.

## Out of scope

- Per-field taxonomy subsets (`domain: { in: [...] }`) so a row type can restrict
  a universal taxonomy; recorded under `TODO.md` `## Later`.
- Schedule-derived whirlpool IBU (existing `## Next` item).
- Freezing the transcripts; the guard change that would require is not needed.
