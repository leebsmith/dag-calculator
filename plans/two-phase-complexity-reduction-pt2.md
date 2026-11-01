---
title: Ceiling 10 and the C901 counting contract
status: active
program: deterministic-dag-calculator
depends_on: []
blocks: []
gate: make check + make test
---

# Ceiling 10 and the C901 counting contract

Follow-up to `plans/archive/2026-11/two-phase-complexity-reduction.md`, which
landed the backend complexity gate at 12 and left two things to carry forward.

The first is a fact worth recording where the threshold lives: C901 counts branch
statements (`if`, `for`, `while`, `except`, match arms), not `and`/`or` or
conditional expressions. A function whose only control flow is a boolean chain
reports 1. That makes the backend's 12 stricter in branch terms than the
frontend's eslint `complexity 12`, which counts booleans and ternaries too.

The second is the next rung. The previous plan recorded ceiling 10 as "one
`_feasible_bound` split away", measured over `backend/app`. The gate is
repo-wide, so it also reaches two scrapers sitting at exactly 12. The rung is
three splits, not one.

Measured at threshold 11 before the change:

| Complexity | File | Function |
|---|---|---|
| 12 | `backend/app/core/batch/orchestration.py` | `_feasible_bound` |
| 12 | `scripts/scrape/bjcp/scrape_bjcp.py` | `main` |
| 12 | `scripts/scrape/hop_scraper.py` | `parse_detail_info` |

## Steps

- [ ] Record the C901 counting contract beside the ceiling in
      `backend/pyproject.toml`
- [ ] Split `_feasible_bound` into a probe, a scan for the lowest feasible ABV,
      and a bisection
- [ ] Split the BJCP scraper `main` into index fetch, category collection and
      per-category save
- [ ] Replace the `parse_detail_info` if-chain with a field table
- [ ] Lower `max-complexity` to 10
- [ ] `make check` and `make test` green at ceiling 10

## Not in scope

- **The frontend ceiling.** Its 12 counts more constructs, so the two numbers are
  not the same measurement. Aligning them is a burndown decision, not a config
  tweak.
- **`scripts/scrape/whitelabs_yeast_scraper.py` and the rest of the scrape tree.**
  They stay under 12 today and the gate will catch the next one.
