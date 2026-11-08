# DESIGN.md

The architectural contract for the frontend. Rules here are enforced by a test
or a guard named beside them; a change that needs an exception changes the rule
first, in the same commit.

Source of truth for behaviour remains `data/artifact.json` (business logic) and
`docs/` (the model). This file governs structure, not brewing semantics.

## Shape

```
main.js (shell: clients, stores, auth)
   └── createStepApp (one composeLayers call)
         ├── base app (session, master, ui, cache, library)
         ├── core layers (navigation, field, draft, unit, snapshot)
         ├── catalog chrome layer (reads a registry it does not own)
         ├── card layers (state + handlers, getView only)
         └── library layers (getView only)
               │
               ├── stepView.compute (frozen refresh state, CARD_REFRESHES order)
               ├── views/ (pure models; only the producer touches the engine)
               └── engine/ (artifact interpreter; no UI, no Alpine)
```

## Rules

**R1 — One composition point; layers, never installers.**
No module outside `adapters/stepAdapter.js` and `adapters/contract.js` may assign
to the app. A new app member arrives as a layer returned by a `create*Layers`
factory and is declared in `adapters/installers.js`. `stepAdapter` contains
exactly one `composeLayers(` call.

*Enforced by:* `tests/guards/composition.test.js`,
`tests/guards/installer-contract.test.js`,
`tests/frontend/catalogDraftKeys.test.js`.

**R2 — Handlers resolve the live view; nothing captures the app.**
A handler or getter addresses the app only through `getView()` /
`liveView.current`. No layer closes over the install-time object, and no module
keys state by app identity (`WeakMap`, `WeakSet`, `Set` of apps).

*Enforced by:* `tests/guards/reactive-proxy-legibility.test.js`,
`tests/frontend/catalog-chrome-proxy.test.js`, and the `this.` scan in
`tests/guards/composition.test.js`.

**R3 — Dependency direction is one-way.**
`engine` imports nothing above it. `views` may import `engine` and `utils`, and
must not import `store` or `adapters`. `store` may import `views` and `engine`,
never `adapters`. `adapters` may import all three. `main.js` is the only shell.

*Enforced by:* `tests/guards/import-boundaries.test.js`,
`tests/guards/engine-access.test.js`, `tests/guards/no-reactivity.test.js`.

**R4 — Cross-card values are returned and declared, never mirrored.**
A refresh may not read a value another refresh writes through the mutable app.
It returns the value; the consumer declares the producer in `CARD_REFRESHES.after`;
`refreshCards` refuses an undeclared order.

*Enforced by:* `tests/frontend/step-pipeline.test.js` and the runtime check in
`adapters/stepView.js`.

**R5 — No silent failure on a path production reaches.**
A `catch` in `engine/`, `views/`, `store/` or `adapters/` must report through the
injected observability manager, write an error surface, or be on the documented
allowlist in `tests/guards/no-silent-catch.test.js`. A factory may default to
`ignoreError` only when it is unreachable from the app; the default must be named
in a comment.

*Enforced by:* `tests/guards/no-silent-catch.test.js` and the producer-failure
assertion in `tests/frontend/step-pipeline.test.js`.

**R6 — Pure functions are tested at their module boundary; app boots are for wiring.**
A pure export in `views/` or `utils/` gets a hermetic test with a stub engine or
context. A suite that boots the app tests only what needs the app: composition,
load/teardown, solve scheduling, proxy reactivity, persistence. Use
`withFreshApp`/`sharedTestApp` (reset) rather than a per-test `createTestApp()`
unless the test mutates card-local draft state.

*Enforced by:* review and the suite layout; `tests/frontend/appHelpers.js`
documents the reset boundary.

## Expression layer — Jexl (`schema_version` 11)

Revision 11 replaces the JSON expression AST with Jexl strings. The artifact is
still the single source of truth; only the expression syntax changes.

**One representation.** Every authored expression is a Jexl string:

| Surface | After |
|---|---|
| `derived.expr` | Jexl string |
| `root` / `choice` / `collection` `default` | Jexl string |
| `collection.fields.*.expr` | Jexl string |
| `functions.*.body` | Jexl string |
| node and schema-field `domain` | Jexl boolean string |
| `relations[].predicate` | Jexl boolean string |

`boundary.domain.codes` is an error-code taxonomy, not an expression, and stays
a list. `inputs` remains the declared alias → path edge map; `output` remains a
value spec.

**Context.** A string resolves identifiers in this order: the node's declared
`inputs` aliases (and the reserved `row` alias in a collection field), declared
`constants`, registered `functions`, then dotted node / selection / boundary /
identity paths. Only `inputs`, `ref`, and default-expression references remain
graph edges; an identifier inside a string is not an edge unless the loader
extracts it and verifies it.

**Absence.** Jexl resolves a missing variable to `undefined` instead of throwing;
that is why it is chosen over Math.js. Absence stays absence: never coerce it to
`0`, `""`, `{}`, or a dropped key. Arithmetic through `undefined` yields `NaN`;
the engine maps non-finite results to absence at a value boundary, and domains
and relations treat them as unresolved (`holds: null`), not violated.

**Reductions are transforms.** The old reduction nodes become registered, pure
Jexl transforms that preserve filter-then-reduce semantics and skip non-finite
values, e.g. `rows | weighted_avg('color_lovibond', 'pct')`. A transform receives
the collection as its subject and field names as string arguments; it may not
read ambient state, time, or randomness.

**Compiled once.** Expressions are parsed and compiled when the artifact is
loaded, then stored on the graph. Evaluation never re-parses a string, and the
engine uses a private Jexl instance so transforms and operators cannot leak
between tests or sessions.

**Safety guardrail.** To regain safety after migrating to string expressions, a
pre-build step must be added to the pipeline: a script that loops through every
`expr` in the artifact and runs `jexl.parse(expression)` just to verify it
compiles.

The same pass must cover `default`, `domain`, `predicate`, `functions.*.body`,
and `collection.fields.*.expr`; it runs in `make check` (and therefore CI)
before any build, and fails on the first string that does not compile. Parsing
is necessary but not sufficient: the structural validator must also walk each
parsed AST and resolve every identifier, preserving the explicit-edge contract.

**Versioning.** The artifact grammar bumps from 10 to 11. This is the artifact
`schema_version`, not the batch payload revision (`DRAFT_SCHEMA_VERSION`); a
frozen batch stores valuations, not expressions. `SUPPORTED_SCHEMA_VERSIONS`
gains 11. The legacy AST evaluator is retained for versions ≤ 10 until the
deprecation window closes, or the schema-version guard is changed to reject
those versions in the same commit.

**Docs and guards.** `expression-language.md` is rewritten for Jexl;
`engine.md`’s interpreter section, `grammar.md` §2/§4/§5, `semantics.md`
§2.2/§4, `adding-a-node.md`, `inventory.md`, and the README documentation table
move in the same commit. A differential fixture proves the old AST and the new
Jexl strings agree on the current artifact before the AST path is deleted.

## Where a change goes

| Change | Home | Guard |
|---|---|---|
| new derived value / input | `data/artifact.json` + `docs/adding-a-node.md` | artifact guards |
| new card behaviour | `adapters/cards/<name>.js` layer factory | R1, R4 |
| new pure readout | `views/` module + hermetic test | R3, R6 |
| new persistence state | `store/` reducer + test | R3, R5 |
| new browser seam | injected option on the factory | R2, R5 |
| new network call | client factory in `adapters/`, injected | R3 |

## References

- `docs/vision.md` — the intent layer and review checklist.
- `docs/frontend-ownership.md` — generated app-member/owners index.
- `docs/adding-a-node.md` — adding an artifact value.
- `tests/guards/` — every rule above has a mechanical check.
