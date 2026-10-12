# Validation Report — Discovery Sweep (Step A corrected)

Gate results for `data/artifact.json` after **Step A (Grammar v2 & Loadable
Artifact)**. All checks were run with the project's own tooling (the engine
validator, `node --test`, `pytest`, `ruff`, `tach`) — **not** a hand-rolled
validator.

> **Supersedes the original report.** The sweep's first report claimed
> "PASS — 0 errors" via a *hand-rolled* validator that did not enforce
> `grammar.md` §2.1 (`root` requires `dimension`). That validator diverged from
> the grammar and passed an artifact our engine rejected on the first
> taxonomy-root (`batch.topology`). That false PASS is withdrawn.

## 1. Engine load / grammar validation (`loadArtifact`)

`loadArtifact()` runs `validateArtifact` (§5 grammar) + `validateDerivedDimensions`.

- **Result: PASS.** Loads with no errors.
- Structural checks enforced: top-level sections (`extra: forbid`); node kinds ∈
  {`root`,`choice`,`collection`,`selection`,`derived`,`boundary`}; every
  `dimension`/`taxonomy`/`schema`/`function`/`constant` id declared; every
  `inputs`/`ref`/`{ref}` path resolves; boundary outputs are valid value specs;
  schema fields reference declared ids; `choice.default` ∈ its taxonomy;
  `schema_version ∈ {1,2}`.
- Counts: **60 nodes** (27 root, 7 choice, 3 collection, 4 selection, 17 derived,
  2 boundary), 16 dimensions, 39 constants, 11 taxonomies, 12 functions,
  10 schemas, 4 relations.
- `schema_version = 2`; `meta.status = "complete"`.

## 2. Boundary parity (field-for-field vs `boundary.py`)

- `solver.batch` inputs = **17** — matches `BatchSolverRequest`.
- `solver.batch` outputs = **19** (nested `cascade`/`hlt` → dotted keys) — matches
  `BatchSolverResponse`.
- `solver.batch.domain.codes` = **13** — matches `BatchSolverErrorCode`.
- `solver.water` inputs = **26** (nested `source`/`target` `IonProfile` → dotted)
  — matches `WaterSolverRequest`.
- `solver.water` outputs = **31** (nested `prescription`/`mash_additions`/
  `sparge_additions`/`post_salt_mash_ions` → dotted; `grist_buckets_kg` → 4 keys)
  — matches `WaterSolverResponse` (excluding advisory `warnings`/`notes`).
- `solver.water.domain.codes` = **10** — matches `WaterSolverErrorCode`.
- **Result: PASS.**

## 3. Dimension checks (`validateDerivedDimensions`)

- **Result: PASS** (runs as part of `loadArtifact`).
- `temperature + temperature_delta` legal; `min` preserves the dimension of its
  `value`; `choice`/`boolean` values are non-dimensional.

## 4. Test suites

- **Frontend** (`node --test`, engine): **40 pass / 0 fail** — includes `choice`
  default + `setRoot`, `min` + `where` (filter-then-reduce), empty-`min` ⇒
  `undefined`, `schema_version` guard, and the boundary/taxonomy resolution.
- **Backend** (`pytest`): **59 pass / 0 fail** — includes `test_water_defaults`
  (C3: `strategy` ⇒ `CALCIUM_FLOOR`; C5: `target_mash_ph` ⇒ `5.4`).
- **Lint / architecture:** `ruff` clean; `tach` ✅; `eslint` + `stylelint` clean.
- **Result: PASS.**

## 5. Golden-vector reproductions

| Check | Expected | Got |
|---|---|---|
| strike base @ T=67, grain=20, R=3.0 | 73.4233 | 73.4233 |
| tun thermal offset (tun=7.5, strike=14) | 3.0214 | 3.0214 |
| final strike temp | 76.4447 | 76.4447 |
| weighted grist Lovibond | 9.2 | 9.2 |
| finished-beer SRM (`morey_lovibond_to_srm`) | 11.7023 | 11.7023 |
| dough-in target (`min` of enabled rests) | 67.0 | 67.0 |

- **Result: PASS.**

## 6. Graph invariants

- **No cycles** (explicit edges: inputs + `ref` + relation refs).
- **Single writer**; **explicit edges only**; **sealed boundaries**
  (`resolution:"iterative"`, binding slugs preserved).
- **No presentation leakage** (see `coverage-matrix.md`).

## 7. Step A corrections applied

- 7 enum inputs re-modelled `root` → **`choice`** (grammar v2).
- `mash.dough_in_target_temp_c` now filters by `where:{ref:"rest.enabled"}`.
- Boundary outputs: **FLAT + dotted** convention ratified.
- `schema_version` → **2**.
- `boundary.py`: **C3** (`strategy` default → `CALCIUM_FLOOR`), **C5**
  (`target_mash_ph` default → `5.4`).

## 8. Known deviations (deferred — see Step B+)

- Relations / `domain` bounds are **declared but not yet evaluated** by the engine
  (Step B).
- Semantic conformance vs the legacy code (beyond the golden vectors above) is
  **Step C**.
- `boundary.py` advisory `warnings`/`notes` omitted from the artifact; other
  contract-hygiene warts deferred (see `gap-register.md`).
