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
reports 1. So a backend ceiling is stricter in branch terms than the same number
on the frontend, which counts booleans and ternaries too.

The second is the next rung. The previous plan recorded ceiling 10 as "one
`_feasible_bound` split away", measured over `backend/app`. The gate is
repo-wide, so it also reaches two scrapers sitting at exactly 12. The rung is
five splits, not one.

Measured at ceiling 10 before the change:

| Complexity | File | Function |
|---|---|---|
| 12 | `backend/app/core/batch/orchestration.py` | `_feasible_bound` |
| 12 | `scripts/scrape/bjcp/scrape_bjcp.py` | `main` |
| 12 | `scripts/scrape/hop_scraper.py` | `parse_detail_info` |
| 11 | `scripts/scrape/hop_scraper.py` | `parse_characteristics` |
| 11 | `tests/backend/conformance/test_route_auth_coverage.py` | `test_every_route_declares_its_auth_dependency` |

The first table written for this plan stopped at 11, which hid the two functions at
exactly 11. Measuring at the target ceiling is the rule: a ceiling of `N` reports
every function above `N`, and `N + 1` reports only what is above `N + 1`.

## Steps

- [x] Record the C901 counting contract beside the ceiling in
      `backend/pyproject.toml`
- [x] Split `_feasible_bound` into a probe, a scan for the lowest feasible ABV,
      and a bisection
- [x] Split the BJCP scraper `main` into index fetch, category collection and
      per-category save
- [x] Replace the `parse_detail_info` if-chain with a field table
- [x] Split `parse_characteristics` into card selection and range extraction
- [x] Extract the per-route audit from the auth-coverage guard
- [x] Lower `max-complexity` to 10
- [x] `make check` and `make test` green at ceiling 10

## Result

Landed at ceiling 10 across every tree `make check` lints, with zero
suppressions. `make check` and `make test` are green (762 backend tests, the
frontend suite, the guard suites).

The rung was five splits, not the three the previous plan recorded, because that
plan measured at 11 instead of at the target ceiling. Two functions sat at
exactly 11 and were invisible to an 11-threshold run.

The maximum is now 10, at exactly three sites: `_validate_record_component` and
`_diagnose_bracket` in the backend, plus one scraper `main`. Any function that
gains a branch above that fails the build.

Both scraper refactors were verified identical to the pre-change code on
synthetic markup: `parse_detail_info` over four `dl.detail-info` shapes
(including empty values, no digits, and a missing `dl`), and the BJCP crawler end
to end against a stubbed session and a temporary working directory.

One observation from the auth-coverage guard: its `method != "GET" and path in
PUBLIC` check was unreachable, because every public path hit `if path in PUBLIC:
... continue` first. It is dropped in the extraction. That is behavior-preserving
(the branch could never fire), but it also means a mutating public route is not
currently caught by that test — a pre-existing gap, recorded here rather than
silently fixed.

## Not in scope

- **The frontend ceiling.** Its 12 counts more constructs, so the two numbers are
  not the same measurement. Aligning them is a burndown decision, not a config
  tweak.
- **`scripts/scrape/whitelabs_yeast_scraper.py` and the rest of the scrape tree.**
  They are under 10 today and the gate will catch the next one.
