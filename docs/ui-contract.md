# UI contract

What a UI may rely on. This is the brief a designer works from: the state shape,
the actions a person can take, and what the solve guarantees. It deliberately
records no grouping, no copy and no layout — those are the design's own work.

The machine-readable half is `data/authoring.json` (every action and constraint)
and `data/surface.json` (every declared path). This document is the prose that
binds them. Numbers here are pinned by guards; see §7.

## 1. State

### Draft payload

A draft is the editable state, versioned `schema_version` 4:

| Key | Content |
|---|---|
| `identity` | the four sealed components: equipment, fermenter, water source, style |
| `hop_strategy`, `discussion`, `fermentation_strategy`, `process_notes` | authored prose |
| `roots` | root and choice values only — never derived, never collections |
| `collections` | rows in each collection's item-schema shape, with computed fields materialized |
| `selections` | copied-forward component snapshots, one per selection |

Two rules follow, and they are not negotiable:

- **Nothing derived is persisted.** A value that can be recomputed has no place
  in the payload; storing it would create a second truth.
- **A selection is a snapshot.** A loaded batch reads its yeast, target profile
  and other components from `selections`, never from the live library, so a
  later library edit cannot change a historical batch.

### Freeze payload

Freezing is where solving stops. The frozen payload carries the complete
`valuation` for every node (boundary nodes flattened to their outputs, absent
values as `null`), the `provenance` of every non-empty selection, the
`conformance` report, `schema_version`, and `valuation_format` `outputs`.

### Migration

Drafts carry the schema version they were written with. A load filters keys that
are no longer roots (a root that became derived must not resurrect as state) and
runs the committed migrations. A frozen batch is never migrated in place.

## 2. Authoring

Every node a person can act on has exactly one declared action. There are fifty-nine:
16 `set`, 17 `override`, 12 `choose`, 5 `pick`, 9 `edit-table`.

| Action | Applies to | Constraint | Meaning |
|---|---|---|---|
| `set` | authored root | `domain` or `none` | a scalar the person owns |
| `override` | inherited root | `domain` or `none` | a default read from identity or a selection, overridable |
| `choose` | choice | `taxonomy` | one member of a declared taxonomy |
| `pick` | reference root and selection | `component` | choose a component; the selection stores the snapshot |
| `edit-table` | collection | `schema` | add, edit or remove rows conforming to the item schema |

**Inherit until override.** Seventeen roots take a `default` that reads identity
or a selection — the style band midpoint, the fermenter's nominal volume, the
equipment's boil-off rate, the water target profile's ions. While unset they
follow their source; once set they are the person's value. The design must be
able to show both states, and it must not treat the inherited value as authored.

### Transforms before the engine

Some authoring nouns are not engine values. These run before the engine sees the
value, and a new client must implement or call them:

| Transform | Owner | When |
|---|---|---|
| `hamilton` | `frontend/src/views/hamilton.js` | authored parts become `pct` and `w_i` for a pool |
| `sugar-share` | `frontend/src/views/producer/sugarAllocation.js` | sugar parts become a share of the extract budget |
| `prior-resolution` | `frontend/src/engine/ingredientPriors.js` | a missing yield or fermentability figure takes the category prior on ingest |
| `mash-preset` | `frontend/src/views/mash.js` | applying a preset replaces the rest rows as one action |
| `scale-pin` | `frontend/src/views/styleTargetsLogic.js` | a pin edit is clamped to the feasible tolerance ray before it commits |

`data/authoring.json` records which transform applies to which action, and a
guard rejects an action that names an unlisted transform.

## 3. Solve

### Timing

Boundaries are solved over HTTP, in declared order:

1. `solver.batch` runs alone.
2. `solver.hops` and `solver.water` run in parallel, both reading the batch
   result.

An edit schedules a solve after a 300 ms debounce. Each scheduled solve takes a
token; a later edit supersedes an in-flight solve, so only the newest result is
applied. Requests are cached by canonical fingerprint and deduplicated while in
flight. Within the topological walk, consecutive resolvable boundaries solve in
parallel.

### Status

Each boundary is in one of four states, and the design must have a treatment for
each:

| Status | Meaning |
|---|---|
| `pending` | scheduled or in flight; values are not yet current |
| `ok` | resolved for the current fingerprint |
| `blocked` | a precondition failed; the reason is carried |
| `error` | the request failed; the last error is carried |

An unavailable boundary degrades every read through it to `undefined` rather
than throwing; dependants show absence, not zero. Offline mode (`remote: false`)
performs no HTTP: preconditions decide `ok` or `blocked` synchronously. A frozen
batch never solves at all — the brew-day path reads the bundle, and a guard
enforces that it imports neither the engine nor the runner.

### Failure vocabulary

- **Boundary codes**, 42 in total: 23 for the batch solve, 9 for hops, 10 for
  water (`INVALID_TARGET_ABV`, `ABV_UNREACHABLE`, `SALT_SOLVE_FAILED`,
  `MASH_TOO_THIN`, …). They are declared on each boundary node and are not
  interchangeable.
- **Relations**, 9 cross-node predicates: 5 blocking and 4 warnings. Wording,
  severity and optional actions live in `frontend/src/views/registry/findings.js`;
  a guard keeps it complete.
- **Domains**, 37 nodes plus schema-field and collection-row domains. A domain
  violation is a value outside its declared bound, not a solver failure.

Absence is not zero and not failure: an unsolved value is `undefined` in the
engine, `null` in a bundle, and a separate state in the UI.

## 4. Identity and causality

Identity is supplied as sealed component snapshots, not as nodes. It creates **no
graph edges** — the engine's adjacency has none — so a client that wants to
explain a change must attribute identity reads explicitly. The impact query does
this: identity namespaces are terminal sources, and a selection swap is
attributed to every identity field the artifact reads.

`impact` answers three questions and no more:

- which nodes depend on a change (the declared closure, with fan-out through all
  outputs of a crossed boundary),
- which boundaries were crossed,
- which identity fields the ancestors read.

It is an over-approximation: it reports declared dependency, not a promise that a
value changes. A UI that shows "this may move" is honest; one that shows "this
will change" is not.

## 5. Appendix: the boundary wire

Status: **specified, not generated.** A client can implement it from this table
today; emitting it from the declarations remains build work.

| Boundary | URL | Request top-level keys |
|---|---|---|
| `batch_sparge_solver` | `/solve/batch` | 30: targets, scale pin, volume, topology, grain bill, sugars, equipment losses and capacities |
| `hop_bitterness_solver` | `/solve/hops` | 13: hop rows, gravities, volumes, times, target IBU, cooling |
| `water_chemistry_solver` | `/solve/water` | 30: source and target ions, pinned set, volumes, forms, mash pH, grist |

Three host transforms sit between the engine and the wire: the grain bill is
normalized to `w_i`/`yield_i`/`mc_i`/`fermentability_i`, trace malts merge into
the water grist as masses, and an apparent fermentability figure converts to real
at the fixed 12 °P reference. Responses are flattened to the declared output
keys. The request-key fixtures and the Python conformance suites pin both sides;
the Pydantic models are the wire truth.

## 6. Open design questions

Intentionally unanswered here: grouping and section order (editorial, checked by
the stage guard), labels and prose, layout and density, navigation between
principles, delta presentation, and which pins should be visible immediately. The
step order is a starting point, not a requirement.

A derived starting point exists: [`artifact-arc.md`](artifact-arc.md) reads the
graph as six stations and states both the mandated order and the implied one.
Grouping, copy and layout remain the design's own work.

## 7. What keeps this honest

- `data/surface.json` and `tests/guards/surface-coverage.test.js` — every path has a home.
- `data/authoring.json` and `tests/guards/authoring-contract.test.js` — every action and constraint.
- `tests/guards/report-parity.test.js` — every printed value is reachable.
- `tests/guards/stage-order.test.js` — no readout before its prerequisites.
- `tests/frontend/impact.test.js` — the causality closure is correct.
- `tests/guards/docs-claims.test.js` — every path this document cites exists.
