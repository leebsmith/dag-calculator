# Alpine maintainability and module linting

Status: **in flight**. Phase 0 landed (`b2467f9`, `614f20a`), Phase 1 landed
(`55f6485`), Phase 2 landed (8 of 8 card groups: `hops`, `late-additions`,
`malt`, `trace-malts`, `yeast`, `mash`, `catalogDraft`, `fieldActions`), Phase 3
landed (`6b9585c`), and Phase 4 landed (`df6028a`). Phase 5 remains: invert the
store's three client imports. Phase 6 — burning down the shape pins Phase 4
inherited — is queued, not started.

Each phase appends its own `Landed.` paragraph under its commit line — what moved,
what deviated, and the counts the gate reported — so this file is the audit trail,
not just the spec.

This is the program named in `plans/archive/decomposition-and-display-contract.md`
§3. It assumes that program is closed and does not reopen any of its decisions.

## 1. Why — measured at `d285ffa`

| Signal | Value | Where it hurts |
|---|---|---|
| Declared app members | **567** (268 methods, 173 getters, 126 state) on one object | Flat scope: nothing says which card owns what |
| Enumerable / hidden | 388 / 179 | The surface guard uses `Object.keys`, so 179 members escape the collision check until they are declared |
| Installers | 19 (`hop` 110, `lateAdditions` 65, `mash` 51, `malt` 46, `libraryUi` 41, `traceMalts` 41) | One card per installer is the only unit of ownership |
| Cross-card reads | **13 of 19** installers read keys owned elsewhere; **≥166** distinct foreign keys | A8 checks that a method exists, not that the caller owns it |
| Template surface | 388 members referenced; 179 unreferenced (55 hidden + 124 internal) | No way to tell public API from internal plumbing |
| Adapter methods | 353; **67 use no `this`**; **28 hot** (≥25 lines or complexity ≥8) | Pure logic sits in wiring; two methods carry complexity 21 and 20 |
| Adapter size | 6,132 lines; `water` 639, `hops` 535, `late-additions` 494 | Cards are files, not modules |
| Lint | `frontend/src` runs **one rule** (`no-unused-vars`, warn); `eslint src` is silent | No `no-undef`, no `eqeqeq`, no complexity, no import restrictions |
| Loose equality | 40 lines (mostly the `== null` idiom, allowed by `smart`) | Cheap to fix now, impossible later |
| `console.*` | 16 | Bypasses `reportError` |
| Store → adapters | 3 imports (`persistence`, `setup`, `recipes`) | State depends on host wiring |
| Refresh order | `stepView.compute()` is 215 lines calling 9 `refresh*Card` in declaration order | Extending a card means editing a screen function |

Nothing here is breakage. It is the shape that makes the next card expensive.

## 2. Decisions (locked)

1. **No new dependencies.** ESLint core rules, the existing `eslint` binary, and
   Node scripts only. No `eslint-plugin-boundaries`, no `dependency-cruiser`.
2. **Keep the single reactive root.** It is an Alpine requirement; the fix is
   ownership, not a second object.
3. **No wholesale namespacing (`app.style.*`).** 567 keys × every template binding
   for no measured failure. Namespacing is the pattern for *new* cards; existing
   cards keep flat members. Revisit only if the ownership guard cannot express a
   real boundary.
4. **Pure logic moves down**: `adapters` = wiring and Alpine assignment;
   `views` = display models and pure derivations; `utils` = formatting and
   generic helpers; `engine` = artifact interpretation. The layering already
   exists and is guarded; this program enforces it inside files, not just between
   them.
5. **New rules start at error, not warn.** `make check` must fail. Rules whose
   thresholds are currently exceeded (size/complexity) land only after the phase
   that brings the code under them.
6. **The ownership index is generated and freshness-tested**, exactly like
   `docs/dag-artifacts/inventory.md`.

## 3. Separation-of-concerns findings

Ranked by cost per future change:

1. **No ownership at call sites.** 166 foreign-key reads across 13 installers.
   `inputKey`/`setInputDraft`/`draftRows` are deliberately shared, but they are
   indistinguishable from private card state in the code and in review.
2. **Pure logic in adapters.** 67 methods touch no `this`; row/field formatters
   (`hopForm`, `hopAlpha`, `maltIsTrace`, `restName`, …) are the obvious bulk.
3. **Domain computation in cards.** `syncScalePreviewState` (55 lines, complexity
   21) and `computeStyleTarget` (54, 20) implement reachable-state maths that
   belongs in `views/` where it can be tested without Alpine.
4. **A screen function owns card sequencing.** `stepView.compute()` mixes
   `produce()`, finding/status indexing, and nine card refreshes.
5. **The store imports host clients** (3 files). The composition root is the only
   place that should know adapters exist.
6. **The surface check is enumerable-only**, so hidden getters are declared after
   the fact or not at all (Phase 7 of the last program found one this way).
7. **The lint contract is empty.** Every other finding is something a lint rule
   could have held: strict equality, unused bindings, complexity ceilings,
   restricted imports, banned globals.

## 4. Phases

Each phase assumes the previous commit is green.

**Reading discipline.** Paths in a phase's read list are relative to
`frontend/src/` unless they start with `frontend/`, `tests/`, `scripts/`,
`backend/`, or `docs/`. A phase reads its `Read first` list plus the files it
edits, and nothing else. A repo-wide grep is allowed only to find the call sites
of a symbol being moved; do not follow what the grep returns. The `Do not read`
line is binding: if a phase seems to need something on it, stop and record why in
that phase's `Landed.` note rather than widening the read.

### Phase 0 — Lint the frontend source (½ day)

**Goal.** `frontend/src` stops being unlinted. Semantic rules only; size and
complexity thresholds wait for Phase 4.

**Read first.** `eslint.config.js` (the whole file — it currently matches only
`tests/**`), `frontend/package.json` `lint`, `Makefile` `check:`,
`tests/guards/import-direction.test.js` (the layer map to mirror),
`frontend/src/main.js` (the global surface).

**Do not read.** `adapters/cards/**`, `views/**`, `store/**`, `engine/**`,
`partials/**`, backend, `docs/**`. Nothing on those paths changes shape here.

**Owns.** `eslint.config.js`, `frontend/package.json` (the `lint` script),
`Makefile` (`check:`), the violations the new rules surface.

**Must not change.** No new dependency. No user-visible change. `eqeqeq` uses
`smart` so the `== null` idiom stays. `no-undef` gets an explicit browser-globals
block — `window`, `document`, `navigator`, `localStorage`, `fetch`, `setTimeout`,
`clearTimeout`, `setInterval`, `clearInterval`, `requestAnimationFrame`,
`cancelAnimationFrame`, `URL`, `Blob`, `crypto`, `console`; do not reach for
`env: browser` (flat config has no such key), and add a name only when the linter
reports it. Warnings must fail (`--max-warnings 0`).

**The three store imports stay.** `no-restricted-imports` mirrors
`import-direction`'s ranks, but `store/{persistence,setup,recipes}.js` each import
an adapter today. Give those three a per-file override carrying the guard's own
reason ("no client seam in the store yet") and leave the inversion to Phase 5.
Inverting them here fails Phase 5's premise and widens the read.

**Rules to land.** `no-undef`, `no-unused-vars` (error), `eqeqeq` (smart),
`no-shadow`, `prefer-const`, `no-var`, `no-console` (`observability.js` is the one
file allowed to implement the sink), `no-duplicate-imports`, `no-fallthrough`,
`consistent-return`, `no-restricted-imports` mirroring `import-direction`'s
ranks, `no-restricted-syntax` forbidding `document.`/`window.` outside
`adapters`/`main.js`.

**Work.** (1) Add the `frontend/src/**/*.js` config block with the globals and
rules above. (2) Fix the mechanical reports: `no-shadow`, `prefer-const`, and the
handful of loose comparisons `smart` does not allow. (3) Add the three per-file
overrides. (4) Route console output last, and read this first: `reportError`
**dedupes by `scope:message`**, so a conversion changes behaviour when a site can
fail repeatedly — `tests/frontend/{recipes,persistence,library,observability}.test.js`
spy on `console.error` and may expect one log per call. Give each of the 15 sites
a stable scope, run those four suites, and where a site must log every
occurrence leave `console.error` under a named per-file override with the reason.
`tests/guards/no-silent-catch.test.js` already accepts `reportError(`, so the
guard needs no change.

**Gate.** `cd frontend && npm run lint`; `make check`; `make test` unchanged.

**Commit.** `Put the frontend source under a lint contract`. Split the console
routing into its own commit (`Route console output through the error sink`) so
the rule change and the dedupe audit stay reviewable.

**Landed.** `b2467f9` and `614f20a`. The rule change lives in one root
`eslint.config.js`: the file the plan read matched only `tests/**`, and the
`frontend/eslint.config.js` that `npm run lint` actually used is deleted — it ran
`no-unused-vars: warn` over `src` and nothing else. ESLint resolves the config by
walking up from the cwd, so `frontend/package.json` is untouched. Two deviations,
both recorded here rather than widened:

1. **`--max-warnings 0` became a config setting.** Every rule the src block lands
   is `error`, so the only warning the block can emit is an unused disable
   directive; it is now `error` via `linterOptions`. Adding `--max-warnings 0` to
   the `lint` script would have staged `frontend/package.json` without a lockfile
   change, and `scripts/precommit.mjs` refuses that pair.
2. **The layer table is generated, not transcribed.** `no-restricted-imports`
   mirrors `import-direction`'s ranks from a `HIGHER(layer)` helper over the same
   rank map, so a layer added in one place is a one-line edit in the other. The
   three store imports get a per-file override whose pattern message carries the
   guard's reason ("no client seam in the store yet"); the store override forbids
   every higher layer except `adapters/` in those three files only, and the
   import-direction guard still owns that boundary.

The first pass reported 14 violations: 2 `no-undef` (`URLSearchParams`,
`TextEncoder` — added to the browser-globals block, which now also names
`URLSearchParams`, `TextEncoder`, timers, `URL`, `Blob`, `crypto`, `console`), 7
`no-restricted-syntax` that were all inside `adapters/` and `main.js` and
disappeared once the DOM rule was scoped to exclude them, 2 `no-shadow` (a
`bootstrapIdentity` parameter hiding the artifact module import; `evaluateDomain`'s
`resolveLimit` parameter hiding the helper it wraps), 2 `prefer-const`, and 2
`consistent-return` (`saveNow`'s mixed `return updated`/`return` — no caller reads
the value; a `.then` callback that mixed `return` with a promise). `eqeqeq`
`smart` reported nothing, so the `== null` idiom never came up.
`docs/**` needed nothing.

Console routing: 16 `console.*` sites, 15 outside the sink. Fourteen now call
`reportError` with stable scopes (`main.session`, `main.recipeList`,
`main.legacyImport`, `main.redirectSignIn`, `main.setupRefresh`, `main.auth`,
`stepAdapter.duplicate <catalog>`, `stepAdapter.libraryRefresh`, `recipes.rename`,
`recipes.trash`, `recipes.restore`, `recipes.delete`,
`library.import <kind>:<legacyId>`) and the four spy suites pass unchanged: the
recipes guard's three row verbs still log three times because each scope is
distinct, and the library guard still sees one log per failed component. One site
kept `console.error` — the autosave report in `store/persistence.js`, where the
sink's `scope:message` dedupe would silence every retry of an offline draft and
`persistence.test.js` pins the message; it sits under a named
`console-sink: an autosave failure logs on every attempt…` override, alongside
`observability.js` itself. `tests/guards/no-silent-catch.test.js` needed no rule
change; its `recipes.js` allowlist entry was re-reasoned from "console.error" to
`recordActionFailure`, which is what those catches actually surface now.

Gate: `make check`, `make test` (856 frontend, 697 backend).

**Handoff.** Every later phase may now rely on the linter to catch a stray
`console`, a shadowed binding, or a layering violation at edit time.

### Phase 1 — Ownership: extend the surface check and govern foreign reads (1 day)

**Goal.** Every member has an owner; every cross-owner read is declared with a
reason; a new one fails.

**Read first.** `frontend/src/adapters/contract.js` (`installerSurfaceGaps`),
`frontend/src/adapters/installers.js`, `tests/guards/installer-contract.test.js`,
`tests/guards/alpine-handlers.test.js`, `frontend/src/views/steps.js` (partial ↔
card mapping), `scripts/emit-artifact-inventory.mjs` (the generator pattern).

**Do not read.** Card bodies (`adapters/cards/**`), `views/**` other than
`steps.js`, `store/**`, `engine/**`, `partials/**` (read a partial only when the
new template rule reports it), backend.

**Owns.** `contract.js`, `installers.js` (shared-interface declarations),
`scripts/emit-ownership-index.mjs` (new), `docs/frontend-ownership.md` (generated),
`Makefile` `generate:`, `tests/guards/installer-contract.test.js`, a new
`tests/guards/ownership.test.js`, the card partials the template rule touches.

**Must not change.** No member renamed or removed. The shared list is data, not a
silent exemption: each entry carries a reason and fails when stale. A8 stays
"every handler calls an app method"; ownership is added beside it, not instead.

**Work.**

1. `installerSurfaceGaps` uses `Object.getOwnPropertyNames(app)` (minus
   `BASE_KEYS`) instead of `Object.keys`, so hidden getters are covered.
2. Generate `docs/frontend-ownership.md`: installer → keys → template-usage
   (partial count), emitted by `make generate`, freshness-tested like the
   glossary.
3. `SHARED` interface in `installers.js`: `{ key, owners: [...], reason }`.
   Baseline today's foreign reads into it, grouped so the review sees the real
   shape (`draft*` and `input*` are shared infrastructure; `waterTargetLocked`,
   `scalePin`, `preview*` are card coupling).
4. `tests/guards/ownership.test.js`:
   - a module may read another installer's key only through `SHARED`;
   - a card partial may reference only its own card's keys + `fmt` + base;
   - every `SHARED` entry is used and reasoned.

**Gate.** `make check`; `make test`; the ownership index is current.

**Commit.** `Give every app member an owner`

**Landed.** `55f6485`. The surface check now walks
`Object.getOwnPropertyNames(app)` minus `BASE_KEYS`, so the 179 hidden members
are governed by the same contract as the 388 enumerable ones (the guard test
gained a synthetic hidden getter and an assertion that the assembled app has
hidden members). `installers.js` became the ownership ledger: each entry carries
the `modules` a read scan attributes `this.<member>`/`app.<member>` reads to and
the `partials` it owns. `docs/frontend-ownership.md` is generated from it
(installer → modules → members → card partials → foreign reads, then a member
table with owner/surface/template count and the `SHARED` interface) by
`node scripts/emit-ownership-index.mjs`, wired into `make generate` and the
pre-commit hook, and freshness-tested against the builder in
`scripts/frontend-ownership.mjs`.

Baseline: 19 installers, 567 members (388 enumerable, 179 hidden), 15 card
partials, 47 cross-owner keys read by 15 of 19 installers (135 distinct
reader/key pairs). The `SHARED` list groups the reasons by interface — the
`draft*` grid and lifecycle, the `input*` map, the shared field verbs, the modal
focus trap, and the genuine card coupling (`scalePin`/`syncScalePreviewState`,
`waterTargetOptions`, `maltCategories`, `styleConformanceReport`). The
`ownership` guard requires an exact match: a read by an unlisted installer
fails, a listed installer that stopped reading fails, as does an unreasoned,
duplicated or undeclared-key entry.

Two deviations, both narrower than the plan:

1. **`owners` means the readers.** An entry keeps the plan's
   `{ key, owners, reason }` shape, but the declaring installer is implicit and
   `owners` lists every installer that may read the key. Listing the owner too
   would repeat the `installers.js` declaration in 47 places for no signal; the
   guard rejects it explicitly.
2. **A card partial can have several owners.** `steps.js` maps a step to a
   partial but not a partial to an installer, so `partials` lives on the
   installer entries. `step-style.html` belongs to the four style installers and
   `step-fermentables.html` to `malt` + `traceMalts`; bindings inside a card's
   owner set are not cross-owner reads. Foreign bindings from a partial are
   attributed to each of its owners, which is why the `input*` readers include
   all four style installers.

The ≥166 figure in §1 is not reproducible from the declaration; the honest
baseline is 47 keys, so that is what `SHARED` records, and the guard checks the
135 reader/key pairs exactly rather than trusting the key count. Gate: `make
check`; `make test` (867 frontend, 697 backend).

**Handoff.** The shared list is the work queue for Phases 2–3: each entry either
becomes a view function or disappears.

### Phase 2 — Extract pure row and field formatters (2 days)

**Goal.** Adapters stop formatting rows; the 67 no-`this` methods move to `views`.

**Read first.** The generated ownership index; the pure surface the extracted
function will live beside — `views/producer/cell.js`, `views/producer/collection.js`,
`views/producer/table.js`, and the one analogous module (`views/hamilton.js` or
`views/waterRatio.js`) whose shape the new module copies. Then, **for the card in
hand only**: its adapter, its test suite, and the partial that binds it.

**Do not read.** `engine/**`, `store/**`, `partials/**` other than the card's own,
backend, `docs/**`, and the seven cards not currently being extracted.

**Owns.** New `views/producer/<card>Rows.js` (or `<card>Fields.js`) modules; the
adapters that delegate to them; `frontend/src/views.js` barrel if one is added.

**Must not change.** No rendered string changes. Methods keep their KEYS entries
and names; the body becomes a one-line delegation. A formatter that needs app
state stays in the adapter. Row/field formatters are pure `(row) → string`.

**Work.** One card per commit, in this order:
`hops` (10 no-`this` methods) → `late-additions` (9) → `malt` (2) → `yeast` (2) →
`trace-malts` (3) → `mash` rest helpers (6) → `catalogDraft` (13) →
`fieldActions` helpers (5). Each commit reads only its own card's three files.

**Gate.** The card's own suite plus `card-display` stay green; the adapter method
count and file size shrink; `make check`.

**Commit.** `Move card row formatters into pure view modules` (one per card group)

**Progress — `hops`, 1 of 8 groups.** `views/producer/hopRows.js` owns the nine
pure row readouts (`hopFormLabel`, `hopAlphaLabel`, `hopAlphaInputValue`,
`hopAlphaStockLabel`, `hopAlphaIsOutsideStock`, `hopBoilPctLabel`,
`hopMinutesLabel`, `hopIbuLabel`, `hopPctLabel`) and the `WHIRLPOOL_HOP_FORMS`
label table, which is display data. The adapter methods keep their names and
`KEYS` entries and delegate in one line; `hopAlphaRange` / `hopAlphaOutsideStock`
take the catalogue record as an argument, so the `ctx.cache.references` lookup
stays in the card. Two notes:

1. **9 of the 10 counted methods moved.** `hopTemp` reads the display unit
   (`ui.unitMode.temperature`) and the artifact through `displayValue`, so it
   stays beside `hopMass` / `whirlpoolHopMass`, which need the hop mass unit —
   the plan's "a formatter that needs app state stays in the adapter".
2. `hopMinutes` and `hopIbu` now print through `views/producer/cell.js`
   (`cellLabel`), the one numeric readout rule, producing the same strings.

`tests/frontend/hop-rows.test.js` covers the module without booting the app; the
adapter is 522 lines (from 535). Gate: `make check`; `make test` (871 frontend,
697 backend).

**Progress — `late-additions`, 2 of 8 groups.** `views/producer/lateAdditionRows.js`
owns the card's nine pure readouts: the `sugarEffectLabels` block (signed ΔOG /
ΔABV, the frozen `+0.000` ΔFG, the displaced-malt label), the table and catalog
counters, the `sugarActive` derivation, the `columnValueLabel` display-unit join
that `previewDoseDisplay` and both draft badges repeated, and the preview pin
labels + envelope state/class table (`LATE_SCALE_PINS`,
`scaleEnvelopeState`/`scaleEnvelopeClass`, `scalePinLabel`). The adapter is 452
lines (from 494) and keeps `syncScalePreviewState`, which now reads the label
and class helpers instead of inlining them.

Two notes:

1. **The "9 no-`this` methods" is a proxy the card does not satisfy literally.**
   A scan of the assigned surface finds one method whose body touches no `this`:
   the `sugarIsActive` getter. The nine extractions are the display derivations —
   three were module-level helpers (`sugarEffectDisplayOf`, `envelopeState`,
   `envelopeClass`), one was a label lookup inlined in `syncScalePreviewState`,
   and the rest were getter bodies or the repeated unit join. What stays is
   wiring: `numberAt` / `currentSugarEffect` (engine reads), `makeRow`
   (catalog → row), `rounded` (dose arithmetic).
2. **Phase 3 inherits the preview pieces.** `syncScalePreviewState` is still the
   Phase 3 target; when it moves to `views/producer/scalePreview.js` it should
   consume `LATE_SCALE_PINS` and the envelope helpers from this module rather
   than re-declare them.

`tests/frontend/late-addition-rows.test.js` covers the module without booting the
app (7 cases); the four late-addition suites and `card-display` pin the rendered
strings unchanged. Gate: `make check`; `make test` (878 frontend, 697 backend).

**Progress — `malt`, 3 of 8 groups.** `views/producer/gristRows.js` owns the
card's readouts: the trace threshold (`isTraceMalt`), the fermentable label with
its provenance marker (`maltFermentableLabel`), the summary-card ordering
(`sortGristRows`), the parts/percent totals (`gristTotalParts`, `gristTotalPct`,
`gristDraftTotalsLabel`), the balance badge (`gristValidationState`), and the
row limit (`MALT_ROW_LIMIT`, `isMaltAtLimit`). The adapter is 175 lines (from
201); every getter keeps its name and delegates with the state it reads, and the
two methods that the surface scan counts as no-`this` delegate in one line.

Two notes:

1. **The "2 no-`this` methods" is again a lower bound.** Only `maltIsTrace` and
   `maltFermentable` touch no `this`, but `maltValidation` and `maltDraftTotals`
   were formatting bodies wrapped around a getter's value; they became
   `gristValidationState(pct) → badge` and `gristDraftTotalsLabel(parts, pct) →
   string`. `sortGristRows` was already pure and module-level in the adapter — it
   moved because ordering a display table is a display derivation, and the card
   suite now boots the app only.
2. **The catalogue policy stays with the wiring.** `MAX_VISIBLE` (25) is the
   drawer's search window and stays beside `installCatalogDraft`; the 8-row
   `MALT_ROW_LIMIT` moved because the balance badge and the clone refusal share
   the same rule. `maltWeightedColor`/`maltWeightedYield` still read
   `fieldsBySlice`: the artifact slice is app state, not formatting.

`tests/frontend/malt-rows.test.js` covers the module without booting the app (6
cases, including the sort case moved out of `malt-card.test.js`);
`malt-card.test.js`, `attenuation-display` (which asserts the provenance marks on
`maltFermentable`) and `card-display` pin the rendered strings unchanged. The
generated ownership index is unchanged — no member was renamed. Gate:
`make check`; `make test` (883 frontend, 697 backend).

**Progress — `yeast`, 4 of 8 groups.** `views/producer/yeastRows.js` owns the
card's readouts: the attenuation label and its bare percent form
(`attenuationLabel`, `percentText`), the band classifier (`attenuationTier`) and
the `YEAST_ATTENUATION_TIERS` label table it buckets into, the tri-state STA1
bucket (`diastaticusTier`) with its counted pill table (`diastaticusTiers`), the
temperature band label (`temperatureRangeLabel`), and the chooser's display cap
(`YEAST_ROW_LIMIT`, `isYeastListTruncated`, `yeastResultLabel`). The adapter is
187 lines (from 211); every member keeps its name and `KEYS` entry and delegates
with the state it reads.

Two notes:

1. **The "2 no-`this` methods" is a lower bound again.** Only `yeastAttenuation`
   and the `yeastAttenuationTiers` getter touch no `this`; the rest of the
   extraction is display policy that happened to be reachable through
   `this.yeastCatalog` — the tier counts, the truncation flag, the result
   sentence. The pills' label tables are display data, so they moved the way
   `WHIRLPOOL_HOP_FORMS` did. `diastaticusTiers(catalog)` takes the catalogue as
   an argument, so `cache.references.yeast` stays in the card.
2. **`MAX_VISIBLE` (25) became `YEAST_ROW_LIMIT` in the module.** Unlike the malt
   drawer window, this one number is both the search window and the truncation
   rule the counter reports, and the badge and the slice must agree; the card
   imports it. `yeastManufacturers`, `filteredYeasts`, and `selectedYeast` stay:
   they read the cache, the filter state, and `filterCatalog`.

`tests/frontend/yeast-rows.test.js` covers the module without booting the app (8
cases); `card-display` pins the rendered strings unchanged (`75.5%`,
`18–22°C`, the counter sentence, the STA1 bucket counts). The generated
ownership index is unchanged — no member was renamed. Gate: `make check`;
`make test` (891 frontend, 697 backend).

**Progress — `trace-malts`, 5 of 8 groups.** `views/producer/traceMaltRows.js`
owns the catalogue→draft row default (`makeTraceMaltRow`): the mass starts at
zero and the yield/fermentability provenance, basis, method, colour, and notes
are the fields the boundary reads. The drawer's subtitle and group lines were
byte-identical to the grain bill's, so they moved to the grain-bill module
instead of a second copy — `maltItemMeta` and `maltGroupMeta` in
`views/producer/gristRows.js`, imported by both cards. The trace adapter is 68
lines (from 90); `malt.js` is 173 (from 175). Every member keeps its name and
`KEYS` entry.

Two notes:

1. **The "3 no-`this` methods" is a proxy that misses this card both ways.** No
   app member here has a `this`-free body — `traceField` and its four getters
   all read `this.fieldsBySlice` / `this.draftMassDisplay`; what the file did
   declare without `this` were three functions: the row default and the two
   drawer formatters. Those are what moved. `traceField` and the three field
   getters stay because the artifact slice is app state,
   `traceDraftMassDisplay` because it delegates to the shared draft helper, and
   `refreshTraceMaltsCard` because it is the engine read.
2. **The shared catalogue display lives with the grain bill, not the trace
   card.** The malt catalogue is one catalogue browsed by two cards, so its
   `°L`/notes subtitle and counted group line belong beside the grain-bill
   readouts; a trace-only module would have re-declared them and drifted.

`tests/frontend/trace-malt-rows.test.js` covers the row default without booting
the app (3 cases: the copied provenance, the absent parts/moisture, a sparse
record); `malt-rows.test.js` gained the two drawer-formatter cases; `card-display`
pins the trace slice readouts and `catalogDraft` the meta-composition contract.
The generated ownership index is unchanged — no member was renamed. Gate:
`make check`; `make test` (896 frontend, 697 backend).

**Progress — `mash`, 6 of 8 groups.** `views/producer/mashRows.js` owns the
card's readouts: the rest catalogue labels (`restLabel`, `restPurposeLabel`), the
recommended-band predicate (`isRestOutsideBand`), the canonical row defaults and
the canon ↔ schedule join (`materializeMashRests`, `canonicalRestRows`), the
temperature rule in its three shapes (`temperatureLabel` at 1dp,
`thicknessLabel` at 2dp, `wholeTemperature` / `restTempRangeLabel` in whole
display units), and the schedule summaries (`mashTimeLabel`, `restMinutes`,
`mashTimeSummaryLabel`, `isLgrBelowFloor`, `lgrSummary`). The adapter is 349
lines (from 378); every member keeps its name and `KEYS` entry and delegates
with the state it reads.

Two notes:

1. **The "6 no-`this` methods" is exact for this card, and one of the six was
   already a delegation.** `getRestDefinition`, `restName`, `restPurpose`,
   `isRestOutOfRange`, `_materializeRests` and the `mashPresetLabels` getter
   touch no `this`; `mashPresetLabels` already returned
   `views/mash.js`'s `MASH_PRESET_LABELS`, so it needed no move and the module
   does not re-export it. The extra extractions are the display policy that was
   only reachable through `this`: two identical 1dp temperature labels
   (`restUseTempDisplay`, `doughInDisplay`), two identical 2dp thickness labels
   (`mashThicknessDisplay`, `minLgrDisplay`), the whole-minute readouts, the LGR
   floor + summary line, and the canon join behind `canonicalMashRests`.
2. **Unit conversion and the artifact slice stay with the wiring.**
   `_convert` reads `artifact`, `engine`, and `ui.unitMode`; `mashField`,
   `strikeWaterTempDisplay`, and the three `unitSymbol` getters read the field
   models and the unit tracker. `mashPresetId`/`mashPresetIdState`,
   `sortedMashRests`/`enabledMashRests`, `sortedMashDraftRests` and
   `isMashDraftValid` are one-line delegations to `views/mash.js` and were
   already pure.

`tests/frontend/mash-rows.test.js` covers the module without booting the app (7
cases: the canon labels, the advisory band, the materialized order with mash-out
on, the canon join, the display-unit labels, the whole-minute time readouts, and
the LGR floor/summary); `mash-card.test.js`, `mash-preset-mirror.test.js` and
`card-display` pin the rendered strings unchanged (`62–65`, `incl. 14 min ramp
(70 min rests)`, `84`, the bound numbers). The generated ownership index is
unchanged — no member was renamed. Gate: `make check`; `make test` (903
frontend, 697 backend).

**Progress — `catalogDraft`, 7 of 8 groups.** `views/producer/catalogDrawer.js`
owns the drawer readouts the four catalogue cards share: the two meta composers
(`catalogItemMeta` / `catalogGroupMeta`), the draft set and the inspected row
(`activeCatalogIds`, `activeDraftRow`), the pill tables (`catalogCategoryPills` /
`catalogFamilyPills`), the standard browser and its selection name
(`catalogStandardGroups`, `standardSelectionName`), the brand/name product
matches (`catalogProductMatches`), the filtered → visible → truncated chain
(`filteredCatalogItems`, `visibleCatalogItems`, `isCatalogTruncated`), and the
two filter toggles (`toggledCategoryFilter`, `toggledFamilyFilter`). The adapter
is 319 lines (from 333); every member keeps its name and `KEYS` entry and
delegates with the state it reads, and `catalogDraftKeys` is untouched.

Three notes:

1. **The "13 no-`this` helpers" is a proxy that this card contradicts.** Only
   `itemMeta`/`groupMeta` have bodies that touch no `this` at all; the rest read
   the reactive state as `this[`${prefix}…`]`, which is the whole point of the
   shared installer — each readout was re-derived per prefix. Fourteen functions
   moved: the eleven catalogue/draft readouts, the two meta composers, and the
   two toggle branches (counted as one helper). What stays is wiring:
   `${prefix}EditorOpen` (the draft lifecycle), `${prefix}Catalog` (its body is
   the `catalogRevision` touch plus the seed-cache lookup), and every handler,
   which assigns state.
2. **The store lookup and the reactivity touch stay in the adapter.**
   `SEED_KEY_TO_CATALOG` is a store import and `views` may not reach up a layer,
   so `catalogNameOf` resolution stays beside `duplicateCatalog${Cap}`; likewise
   `void this.catalogRevision` and the `standardField` / empty-query guards that
   decide *whether* the getter reads the cache.
3. **The drill-down flag is one predicate.** `visibleCatalogItems` and
   `isCatalogTruncated` take `drilledIn` rather than the two config fields, so
   the cap and the truncation badge cannot disagree about whether a standard is
   selected.

`tests/frontend/catalog-drawer.test.js` covers the module without booting the
app (10 cases: the meta composers, the draft set, the pills, the standard
browser, the brand search with its cap and pills, the selection name, the
filtered/drill-down order, the cap/truncation pair, the active row, the
toggles); `catalogDraft.test.js` (25 cases) plus the hop, malt, trace-malt and
late-addition suites and `card-display` pin the rendered strings unchanged. The
generated ownership index is unchanged — no member was renamed. Gate:
`make check`; `make test` (913 frontend, 697 backend).

**Progress — `fieldActions`, 8 of 8 groups.** `views/producer/authoring.js`
owns the five authoring helpers: the input-draft key composer (`fieldInputKey`),
the parts → pct Hamilton normalization that `normalizeGrist` and
`normalizeHopRows` both repeated (`normalizedRowShares`, one rule for the grist
and the two hop pools), and the type-appropriate defaults a blank row is seeded
with (`rowDefaults(schema, taxonomies)`). The adapter is 276 lines (from 293);
every member keeps its name and `KEYS` entry.

Two notes:

1. **The "5 helpers" is exact, with one relocation.** Four methods touched no
   `this` (`inputKey`, `clampToSelection`, `normalizeGrist`,
   `normalizeHopRows`); the fifth is `addRow`'s inline default builder, which is
   pure but was reachable only through the engine write. The two normalizers were
   byte-identical, so they collapse into one module function rather than two; the
   clamp body duplicated the strict `clamp` utility (`utils/format.js`), so that
   helper went there instead of a third copy — `clampToSelection` now keeps the
   envelope lookup and the engine read and returns `clamp(value, low, high)`.
2. **The wiring is unchanged.** `inputKey` still takes `(prefix, ...parts)`, so
   the ten partial bindings and the style/water cards that compose keys keep
   their call shape; `normalizeGrist`/`normalizeHopRows` keep their names and the
   node-id dispatch in `editCell`/`removeRow`; `rowDefaults` takes the artifact's
   taxonomies, so the `artifact` read stays in the adapter.

`tests/frontend/authoring.test.js` covers the module without booting the app (6
cases: the key shapes, the Hamilton result and its exact 0.1% total, empty and
zero-weight rows, the five schema branches, a missing schema);
`number-input.test.js` and `selection-validation.test.js` pin the app paths. The
generated ownership index is unchanged — no member was renamed. Gate:
`make check`; `make test` (919 frontend, 697 backend).

**Handoff.** The `views/producer/` surface now holds everything that formats a
row, and can be tested without booting the app.

### Phase 3 — Split the hot computations and declare the refresh pipeline (2 days)

**Goal.** No card method above complexity 12 or 40 lines without a recorded
reason; card refresh order is data.

**Read first.** `adapters/cards/late-additions.js` (`syncScalePreviewState`),
`adapters/cards/style/{navigator,targets}.js` (`computeStyleTarget`,
`syncScalePinState`), `engine/fermentation.js`, `views/producer/stylePlot.js`,
`adapters/stepView.js`, `tests/frontend/{style-card,late-additions-*,fermentation-space}.test.js`.

**Do not read.** The water, hop, malt, mash, yeast, trace-malts, brew-day and
catalog cards; `store/**`; `partials/**`; backend; report code.

**Owns.** New `views/producer/{scalePreview,styleTarget}.js`; `adapters/stepView.js`;
`adapters/cards/*` (delegations); `tests/frontend/step-pipeline.test.js` (new).

**Must not change.** No solved-value or formatting change. `refresh*Card` keeps
its signature and order; the order moves into a declared list. The style plot
stays precomputed.

**Work.**

1. `syncScalePreviewState` → `views/producer/scalePreview.js` returning the
   preview state; the adapter assigns the result.
2. `computeStyleTarget` → `views/producer/styleTarget.js` over
   `engine/fermentation.js` primitives.
3. `stepView.compute()` becomes three named steps — `produceFields`, `indexStatus`,
   `refreshCards` — with `CARD_REFRESHES = [yeast, style, malt, traceMalts, hop,
   lateAdditions, mash, brewDay, water]`. A test asserts every installer that
   exports `refresh*Card` appears exactly once, in the declared order.

**Gate.** `style-card`, `late-additions-*`, `fermentation-space`, `step-pipeline`;
`make test`.

**Commit.** `Split the style and late-addition computations out of the cards`

**Landed.** `6b9585c`. Two modules and one declared pipeline:

- `views/producer/styleTarget.js` (101 lines) owns the fermentation-target
  derivation: `styleRegionState(envelope)` (the complete-envelope predicate, the
  feasible vertices, the safest point), `styleExtractPoint({ region, solvedOg,
  solvedAa, fallbackAa, targetAbv })` (solved point → target inverse → fixed-AA
  ray → centroid), the `SCALE_PINS` table, `scalePinState` (the eight pin mirrors,
  including the ABV-vs-SG unit and step), and `scaleTargetMismatch` behind
  `scaleTargetLabel`. `computeStyleTarget` is 24 lines from 54 (complexity 20) and
  `navigator.js` is 240 lines from 274. `syncScalePinState` is nine lines from 21
  and `refreshStyleTargets` ten from 20; `targets.js` is 262 lines from 291 and
  imports the pin table instead of declaring it.
- `views/producer/scalePreview.js` (72 lines) owns the preview pin matrix
  (`scalePreviewRows`), the caption (`scalePreviewCaption`) and their composition
  (`scalePreviewState`), consuming `scaleEnvelopeState` / `scaleEnvelopeClass` /
  `scalePinLabel` from `lateAdditionRows.js` and `isFiniteNumber` /
  `formatPercentRange` from the barrel. `syncScalePreviewState` is 22 lines from
  55 (complexity 21); `late-additions.js` is 415 lines from 452.
- `stepView.compute()` is six lines: `produceFields(engine)`, `indexStatus()`,
  `refreshCards()`. The order is the exported `CARD_REFRESHES` list (nine entries,
  yeast → style → malt → traceMalts → hop → lateAdditions → mash → brewDay →
  water). `tests/frontend/step-pipeline.test.js` reads `adapters/cards/**`,
  collects every `refresh…Card` export, and fails unless each appears exactly once
  in the list, in the declared order; a boot case asserts `compute()` fills the
  produced field index, the status buckets and the style/late-addition snapshots.
  `stepView.js` grew 215 → 231 lines: the order is data now, and a duplicated
  `readConstant` went away.

Two deviations, both narrower than the plan:

1. **The style target is two functions, not one.** `computeStyleTarget` returned
   early when the style region had fewer than three vertices, so a style-less *or*
   boundary-less batch never resolved `batch.realized_og` /
   `apparent_attenuation`. A single `styleTargetState({ envelope, solvedOg, … })`
   resolves both before the region check, and `step-boundaries` caught it ("No
   boundary binding registered"). The split keeps the guard where the reads are:
   `styleRegionState` is total, and `styleExtractPoint` runs only behind
   `styleRegion.length >= 3`.
2. **`syncScalePinState` moved although it fits the ceiling.** It was 21 lines,
   not one of the two hot methods, but the pin table it reads was already moving
   and the mapping is the same pure derivation as the mirrors; leaving it behind
   would have split one rule across two layers. The same argument moved
   `fmtTarget` → `scaleTargetLabel` and the mismatch comparison →
   `scaleTargetMismatch`, which removed the nested display ternary from the
   adapter.

Gate: `make check`; `make test` (936 frontend, 697 backend).

**Handoff.** Adding a card refresh is one list entry plus one export; forgetting
either fails a test.

### Phase 4 — Turn on the size and complexity ratchet (½ day)

**Goal.** The thresholds that Phase 0 deferred now hold, so the shape cannot
regress.

**Read first.** `eslint.config.js`, the Phase 2–3 diff, `docs/frontend-ownership.md`.

**Do not read.** Any source file. This phase only chooses thresholds and named
overrides from violations the linter reports; a threshold that needs code read to
justify is a threshold that is wrong.

**Owns.** `eslint.config.js`, a small `/* eslint-disable */`-free allowlist
expressed as per-file rule overrides with reasons, `Makefile` if `check` needs it.

**Rules to land.** `complexity: 12`, `max-depth: 4`, `max-lines-per-function: 80`,
`max-lines: 500` (or 400 after the splits), `max-params: 5`,
`max-statements: 40`. Any surviving exception is a named override, not a
baseline file.

**Gate.** `make check`; `make test`.

**Commit.** `Cap card size and complexity in the linter`

**Landed.** `df6028a`. `SHAPE_RULES` in `eslint.config.js` — `complexity 12`, `max-depth 4`,
`max-lines-per-function 80`, `max-lines 400`, `max-params 5`,
`max-statements 40`, all `error`, over the same `frontend/src/**` block Phase 0
created. No source file was read or edited: the phase chose ceilings and
recorded what the linter reported. The first pass was **96 violations in 45
files**; every survivor is a named override beside the rules, in seven shapes:

- **surface declarers** — 19 files at `max-lines-per-function: 450`
  (19 `install*` / `register*` / `create*Store` functions). Every member is
  declared one key at a time, and the ownership index plus the surface guard are
  that contract; a line count adds nothing.
- **grammar dispatch** — `engine/{dag,units,validate}.js` at 300 lines per
  function; **one pass per file** — `boundaryRunner.js` and `stylePlot.js` at 210.
- **complexity pins**, 13 under "grammar dispatch" (`engine/units.js` 93 down to
  `views/registry/presentation.js` 14) and 14 under "lifecycle branches"
  (`adapters/cards/water.js` 38 down to `store/persistence.js` 13).
- **statement pins** (8 functions, 65 → 42), **param pins** (5 functions in 4
  files, 7 → 6), **depth pins** (2 functions, 5), **file-size pins** (7 files,
  650 → 450).

A pin is the count the linter reported, not a round number, so the pin is the
ceiling *and* the burn-down target: when a split lowers a function's count, the
pin is lowered in the same commit, and a pin that no longer matches its file is
deleted. A probe (a 13-branch arrow under `utils/`) failed the build, so the
ratchet binds on new code as well as old.

Three deviations:

1. **The §5 metric "≤10 hot methods, each in a named override" does not hold.**
   The two methods Phase 3 split were the two *card* hot spots; the ratchet sees
   the whole source, and 48 functions in 27 files sit above complexity 12, led by
   the artifact interpreter (`engine/units.js` 93, `views/producer/projection.js`
   39, `adapters/boundaryRunner.js` 35, `engine/validate.js` 34,
   `views/producer/scalar.js` 33, `store/userCatalog.js` 33). Phase 2–3 never
   touched those paths, so the count is inherited, not a regression. Pinning them
   is the honest landing; the alternative was to leave the whole source uncapped
   until an unplanned refactor. The burn-down is Phase 6 below.
2. **`max-lines` landed at 400, not 500.** The plan allowed either; 400 is the
   number the program committed to, so the rule keeps it and the seven files above
   it carry pins (water 650, hops / fermentation / format 550, stepAdapter /
   recipes 500, late-additions 450) rather than the ceiling being relaxed
   everywhere. The plan's "maximum adapter file ≤ 500 (target 400)" metric fails
   today: the largest is `cards/water.js` at 639, four adapters sit above 400
   (`water`, `hops`, `stepAdapter`, `late-additions`), and `utils/format.js` (514)
   and `engine/fermentation.js` (506) also carry pins.
3. **Exceptions are grouped by reason, not written one per violation.** 45
   per-file entries would have been a baseline in config clothing; six pin tables
   plus three grouped overrides say why each shape is legitimate, and the table
   entry is where the count lives.

Gate: `make check` (eslint clean, stylelint clean, ruff clean, tach clean);
`make test` (936 frontend, 697 backend + 1 skipped, unchanged).

**Handoff.** Phase 5's store change must fit `complexity 12` and
`max-lines-per-function 80` — `store/recipes.js` is already at the 450-line
surface-declarer ceiling and `store/library.js` carries a complexity pin, so a new
branch in either is a lint error, not a review note.

### Phase 5 — Invert the store's client imports (½ day)

**Goal.** The store stops importing adapters; the composition root injects clients.

**Read first.** `store/{persistence,setup,recipes}.js`, `adapters/{batchClient,libraryClient,download}.js`,
`main.js`, `tests/guards/import-direction.test.js` (the three baselined entries),
`tests/frontend/persistence.test.js`, `tests/frontend/recipes.test.js`.

**Do not read.** Cards, `views/**`, `partials/**`, `engine/**`, backend. The
seam is between the store and three client modules; nothing else participates.

**Owns.** `store/*`, `main.js`, `tests/guards/import-direction.test.js`,
`tests/frontend/*` fakes.

**Must not change.** Behaviour; autosave timing; the download flow. The three
allowlist entries are deleted, not reworded.

**Gate.** `make check` (import-direction allowlist now empty); `make test`.

**Commit.** `Inject the batch and library clients at the composition root`

### Phase 6 — Burn down the shape pins (queued, unestimated)

Phase 4 pinned 48 complex functions and 7 oversized files at their reported
counts. This phase lowers them to the ceilings, deleting each pin as its file
complies, in the order the pins point:

1. **The interpreter** — `engine/units.js` (93), `projection.js` (39),
   `engine/validate.js` (34), `scalar.js` (33), `engine/ast.js` (22) are dispatch
   over the artifact grammar; the split is a table per node kind, not a decision
   tree.
2. **The solve and refresh paths** — `boundaryRunner.js` (35, 210 lines),
   `cards/water.js` (38, 639 lines), `stepView.js` (19).
3. **The stores** — `store/userCatalog.js` (33), `store/unitPrefs.js` (27),
   `store/library.js` (18).
4. **File sizes** — `cards/water.js`, `cards/hops.js`, `utils/format.js`,
   `engine/fermentation.js`, `store/recipes.js`.

**Gate.** After each step, `make check` with the corresponding pin removed rather
than re-pinned; `make test` unchanged.

## 5. What this buys

| Change | Today | After |
|---|---|---|
| Add a card | edit installer, KEYS, partial, `stepView.compute`, hope nothing collides | KEYS + installer + partial + one refresh entry; three guards fail if a step is missed |
| Add a cross-card read | invisible | one `SHARED` entry with a reason |
| Add a row formatter | a method on the app | a pure function in `views/` with a unit test |
| Change a threshold | silent | lint error |
| Find who owns a member | grep 6k lines | generated index |

**Metrics to hold at the end:** 0 ungoverned foreign reads; 0 no-`this` methods
in adapters; ≤10 hot methods, each in a named override (**Phase 4 measured 48
functions in 27 files, all pinned — the gap is Phase 6**); ≤1 lint rule → ~20;
maximum adapter file ≤ 500 lines, target 400 (**measured 639 in `cards/water.js`,
four adapters above 400 — Phase 6**); refresh list explicit; store imports no
adapters.

## 6. Risks and non-goals

- **Risk — lint noise.** `no-undef` with an incomplete globals list produces
  false positives. Mitigation: enumerate the browser surface from the existing
  code (`document`, `window`, `navigator`, `localStorage`, `fetch`, timers,
  `requestAnimationFrame`, `CustomEvent`, `URL`, `Blob`) and add only what is
  used.
- **Risk — ownership guard churn.** 166 baselined reads is a large starting list.
  Mitigation: group by interface (`draft*`, `input*`, `scale*`, `preview*`), not
  per key, and let Phases 2–3 delete most groups.
- **Risk — extraction changes a string.** Mitigation: every extraction phase is
  gated by the card suites that already assert display strings; no formatting
  code is touched.
- **Non-goal — a second reactive root.** Alpine requires one; the program fixes
  ownership, not object count.
- **Non-goal — renaming members.** No key is renamed in this program; renames
  would break templates, tests, and saved drafts in one commit for no ownership
  gain.
- **Non-goal — TypeScript or a new framework.** Out of scope; the lint contract
  is the cheap approximation.

## 7. Order and cost

Phases 0–1 are half the value for a day and a half: the linter and the ownership
index are what make the rest of the program reviewable. Phases 2–3 are the actual
reduction and carry all the regression risk, so they land card by card. Phases 4–5
close the loop. Total ≈ 6½ days, four of them mechanical extraction.

Each phase is independently committable and green; stopping after Phase 1 still
leaves the repo measurably better governed.
