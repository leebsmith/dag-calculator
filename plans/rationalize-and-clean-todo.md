---
title: Rationalize and clean TODO.md
status: active
program: deterministic-dag-calculator
depends_on: []
blocks: []
gate: make check + make test
---

# Rationalize and clean TODO.md

`TODO.md` has one cleared item still listed as current, three entries whose facts
have drifted, and a Done section that retells 35 completed plans in prose. This
plan removes the cleared item, corrects the drifted entries, and collapses Done
to one-line links.

## Steps

- [ ] Remove the cleared `## Now` item (style targets ±2 JND, landed in `7e5866f`)
      and record it under Done
- [ ] Reword the footer item to the work that remains
- [ ] Refresh the shape-pin burn-down counts and record the backend gate
- [ ] Fix the "below" cross-reference in the Optimize-local-testing entry
- [ ] Promote the still-open catalog-duplicate residual to `## Later`
- [ ] Collapse Done to one-line entries with their plan links
- [ ] `make check` and `make test` green

## Decisions

- **The cleared item moves to Done rather than being deleted**, so the intent
  record survives.
- **The catalog-duplicate caveat moves to `## Later`.** The Done entry for hop
  catalogue repeats notes that malts, sugars and trace malts still hide what is
  already in the draft. That is open work, so collapsing the entry would lose it.
- **`plans/hops-documentation-and-dry-hop-card.md` is `status: shipped` but still
  sits in the plans root.** Archiving it is out of scope here and is recorded as an
  observation only; moving it would change the links living docs cite.
- **The burn-down counts are re-measured, not copied.** They were recorded at an
  older revision; the plan-entry counts are what the linter reports today.

## Result

Filled in on completion.
