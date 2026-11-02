# Decisions — D3, D4, D8, and the 2b gate (resumable)

Companion to `plans/codebase-rationalization.md` (the plan). All three decisions
are settled (2026-11-02). D4 carries one deferred choice, the post-2a 2b gate, with
its measurements written down so it can be resumed cold.

**Closed and not to be re-litigated:** D1 (one host, curve as a declared output),
D2 (dissolved — stub becomes a tests-only double), D3 (A now, D as W3B), D4 (2a now,
2b gated on the measurements below; 2a′ and 2c rejected), D5 (documentation
retirements), D6 (ownership index: keep the summary, drop the 698-line member dump),
D7 (shape-only test double), D8 (same-origin Hosting rewrite to Cloud Run), plus the
brew-day guard and the TODO/vision/engine wordings.

**Resume protocol:** read the plan section named below; re-verify the "facts to
re-check" list, because line counts and node paths drift; then decide. Every option
below assumes the http-live rule from the plan (§2): no domain math in the browser.

---

## D3 — does axiom A3 hold? (settled 2026-11-02: A, then D)

Plan sections: §5 (W3A, W3B). Unblocks W3A; W3B feeds W2b's label source.

### The question

199 registry entries describe 199 artifact paths (196 unique keys; 3 are declared
twice; the declared path space is ≈390, so just over 50% coverage). Is that a
second description to collapse, or the boundary the architecture wants?

### Facts (re-verified 2026-11-02)

- 199 declarations, 196 unique keys. The 3 shadowed duplicates are
  `batch.boil_target_ibu`, `batch.whirlpool_target_ibu` (`registry/hops.js` vs
  `registry/batch.js`) and `batch.sugar_extract_total` (`registry/late-additions.js`
  vs `registry/batch.js`); `registry/index.js` spread order makes `batch.js` win.
  8 table labels also exist in `views/steps.js`.
- Metadata: 55 `unit`, 52 `displayUnit`, 43 `decimals`. Derivation is mechanical:
  `views/registry/units.js` exports `unitDecimals()`; `producer/projection.js`
  resolves collection columns from the dimension and `producer/scalar.js` falls back
  the same way, so deleting derivable entries does not change the display path.
- The fallback that makes the 8 duplicate labels deletable already exists:
  `views/registry/catalog.js:213` resolves `registry[path].label` first.
- A3 guard: `tests/guards/artifact-purity.test.js` denies
  `label|title|display|decimals|format|…`; `displayUnit`, `hint` and `optionLabels`
  are allowed by omission. The artifact currently uses none of the three, so the
  holes are latent, not live.
- The false doc claim is `docs/dag-artifacts/grammar.md:334` (`extra: forbid`);
  `engine/validate.js` accepts unknown keys.
- `docs/display-precision.md` restates `units.js` decimals with no guard. The name
  `tests/guards/display-precision.test.js` is already taken by a different guard
  (decimal-policy presence), so the doc guard needs its own name.
- Option B's cost is not the axiom alone: `artifact.hash` is
  `sha256_canonical` of the whole artifact, so a copy edit would change the model's
  identity, while the freeze payload already carries `NodePresentation.label` under a
  separate `catalog.hash`.

### Decision

**A now, D as W3B.** A is the immediate cleanup; D makes the cleanup permanent by
generating the registry from one committed label source. B and C are rejected: they
spend A3, change the artifact hash on copy edits, and buy zero lines.

**W3A (A) — cleanup.** Delete the derivable `unit`/`displayUnit`/`decimals`; dedupe
the 3 keys and the 8 step labels; collapse the checklist level labels, hop
product-form labels and water ion labels; add the doc-precision guard; **deny
`displayUnit`/`hint`/`optionLabels`** in the A3 denylist (`unit` stays allowed as a
domain unit id — it drives conversion; the artifact uses none of the three, so the
holes close for free); fix the `extra: forbid` sentence; record in `docs/vision.md`
that labels are presentation.

**W3B (D) — generated registry.** One committed source, `data/labels.json`, holds
only the non-derivable copy (path → label, plus taxonomy option labels). An emitter
(`scripts/emit-registry.mjs`) reads it with the artifact and `views/registry/units.js`,
derives `unit`/`displayUnit`/`decimals`, and writes
`frontend/src/views/registry/generated.js`; `registry/index.js` composes it first.
Hand-written modules keep structural exports (`WATER_IONS`,
`WHIRLPOOL_ROW_DEFAULTS`, `HOP_NODES`) and labels keyed by taxonomy or pin rather
than node path. A byte-compare guard plus precommit regeneration —
the pattern already used four times for docs and once for mash rests
(`views/registry/mash.js:3-7`). The guard fails on a label path that does not
resolve, on a generated entry whose unit/decimals duplicate the derived default, and
on a hand-written module that re-declares a generated path — so W3A's deletions
cannot silently return.

### Sequencing

W3A → W3B, then W2a (disjoint files). W3B must land before W2b: 2b consumes the
generated registry by path and may not relocate copy into the descriptor. If D4
chooses 2b, that constraint is part of the decision.

---

## D4 — how deep does the collection-UI rationalization go? (settled 2026-11-02: 2a, then a gate)

Plan section: §4 (W2). Unblocks W2a; 2b stays conditional.

### The question

Six catalogue collections are 4,787 lines (18.6% of `frontend/src`); ten surfaces are
7,480 (29%). The data layer is already shared (`catalogDraft.js` 334,
`draftEditor.js` 307). The markup and the inspector form were never shared.

### Facts (re-verified 2026-11-02)

- Six modals, **1,937 lines** total (dry-hop 343, hop 315, malt 389, sugar 192,
  trace-malt 357, whirlpool-hop 341). The earlier note said "five".
- Identical-shape blocks: draft table ≈425 lines across six files (hop vs whirlpool
  differ only in member names over `modal-hop-editor.html:41-104` vs
  `modal-whirlpool-hop-editor.html:41-104`); search pane ≈646 lines
  (`modal-malt-editor.html:161-315` vs `modal-trace-malt-editor.html:131-283` differ by
  two lines); inspector form ≈360 (malt vs trace byte-identical after prefix
  normalisation); drawer shell ≈150; section shell ≈100.
- Handlers are **already** generated once by `installCatalogDraft`
  (`adapters/cards/catalogDraft.js`): `inspect${Cap}Row`, `open${Cap}Search`,
  `remove${Cap}`, `handle${Cap}Escape` are one implementation parameterised by prefix.
  What is duplicated is the markup and the per-prefix drawer/search **state**
  (`${prefix}Drawer`, `${prefix}Search`, `${prefix}ActiveIndex`, filters). 2a must
  unify that state; a shared partial cannot know the prefix. Safe because only one
  editor is open at a time.
- Guard constraints: `dialogs.test.js:47-62` requires a **static** `aria-labelledby`
  id per file (so the dialog wrapper cannot move into the partial);
  `control-states.test.js` requires `for`/`:for` labels;
  `number-input-contract.test.js:10-18` needs any new numeric handler in
  `BUFFERED_HANDLERS`; `presentation-ids.test.js:12-26` forbids node-path literals
  outside `views/registry`; `import-direction.test.js:14-28` ranks a descriptor at
  `views/` and forbids it importing adapters.
- `eslint.config.js:190-199` + `tests/guards/shape-pins.test.js:12-24` pin
  `cards/hops.js` (476), `late-additions.js` (404), `water.js` (639); lower a pin in
  the same commit that improves the file.
- Non-declarative by nature: `cards/water.js` (639, constraint declaration), `style/*`
  (plot + pin mirror), sugar share mode, mash canonical rests, dry-hop
  contact/duration exclusivity, cooling-curve picker.

### Decision

**2a committed; 2b gated; 2a′ and 2c rejected.**

- **2a now** — shared chrome: generic `inspectDraftRow`/`removeDraftRow`/
  `openDraftSearch`/`closeDraftDrawer`/`handleDraftEscape` over one set of drawer
  state, three partials (draft table, drawer shell, search pane), six modals keep
  their wrapper, inspector and static aria id. Prefixed names survive one release as
  aliases. Markup only, −900…−1,100 lines, revertable alone.
- **2b later, only if the gate passes.** The descriptor is the largest structural win
  left, but after 2a the handler factory is already generic, so the win may be
  narrower than the original estimate.
- **2a′ rejected** — generated modal source buys no conceptual reduction and adds a
  fifth generated surface to precommit.
- **2c rejected** — it is the point where a descriptor stops describing and starts
  pretending.
- **2b-minus-KEYS allowed** — if the gate shows the inspector is the only uniform
  block left, one inspector partial driven by column metadata is the honest stopping
  point rather than the full descriptor.

### The 2b gate (measure after 2a)

1. Residual modal size: `wc -l frontend/src/partials/modal-*.html`.
2. Residual uniform vs bespoke: inspector and section shells versus sugar share, mash
   rests, dry-hop exclusivity, water.
3. Prefix plumbing left: how many of the 36 `catalogDraftKeys` names and ~20 `SHARED`
   entries survive 2a.
4. Draft `form[]` for malt and dry-hop; count fields needing `when`/setter special
   cases versus plain fields.

**Proceed with 2b if** the residual is ≥ ~500 lines of uniform markup and roughly
two-thirds of the fields are plain. **Stop, or take 2b-minus-KEYS, if** the residual
is mostly the bespoke tails. Record the measurements in the 2b commit or in this
file before starting it.

### Constraint carried from D3

If 2b happens, `form[]` reads the generated registry by path (W3B) and may not move
copy into the descriptor.

---

## D8 — what is the API origin in production? (settled 2026-11-02)

Plan section: §3 step 10 (W1). Blocks: only the deployment step of W1 — the code lands
without it.

### Decision

**A. Same-origin Firebase Hosting rewrite to the Cloud Run service.** The production
run is Firebase Hosting + Firestore + Cloud Run in one project; Hosting supports Cloud
Run as a rewrite destination, so the browser keeps talking to its own origin.

### Why A and not B/C

- The backend has **no CORS middleware**. The app is same-origin by construction, so B/C
  would add a new application surface (CORS) on top of the mandatory CSP edit — three
  changes instead of one.
- The Makefile already assumes the proxy: `deploy-backend` is
  `--allow-unauthenticated` because "Firebase Hosting proxies a browser that cannot hold
  an IAM identity". The rewrite is the missing half of a decision the deploy scripts
  already encode.
- Rate limiting is per-uid (`auth/throttle.py`), not per-IP, so Hosting's forwarded
  headers need no trust work.
- `apiClient.js:13` and `main.js:222` already assume `base = ""`; B/C would make that
  default a lie.

### Rewrite set (from the live router)

| Source | Covers |
|---|---|
| `/solve/**` | batch, water, hops |
| `/batches/**` | records, freeze, report-bundle, report |
| `/brew-sessions/**` | sessions, observations, finalize, report |
| `/catalog/**` | catalogue CRUD |
| `/report/**` | `/report/sections` (the earlier note said `/report`; the live route is `/report/sections`) |
| `/session` | auth probe; exact match, a `/**` glob would not cover the bare path |

All six precede `** → /index.html`, because Hosting takes the first match.
`/health` stays off Hosting; monitoring hits the Cloud Run URL directly.

Known consequence: an unmatched API path falls through to the SPA and returns HTML 200
instead of a JSON 404. Accepted; a `/api/**` prefix would fix it but means changing every
client path builder.

### Follow-through (W1 step 10, not yet landed)

- `firebase.json`: the six `run` rewrites before the SPA rewrite. Emulators and the Vite
  dev proxy are untouched — `make local-dev` never uses the hosting emulator.
- `make deploy-frontend` (not `make build`): assert `VITE_API_BASE` is unset and the
  built bundle contains no `.run.app`, so a cross-origin build cannot ship. Keeping it
  out of `make build` stops a developer's exported variable from failing hermetic
  `make verify`.
- **Update the `README.md` deployment contract** under "Auth & deployment" in the same
  commit as the rewrite: production topology (Hosting + Firestore + Cloud Run, one
  origin), the same-origin rewrite invariant, `VITE_API_BASE` unset, the
  Admin-SDK-only data path, and a pointer to `firebase.json`/the `Makefile` for the
  mutable values (project id, region, service name). Land it with the rewrite, not
  before, so the doc never describes a config that does not exist.
- Smoke tests after the first deploy: a signed-in `/session` returns 200 (the
  Authorization header survives the rewrite), and the PDF report renders inside the
  Hosting request timeout — the only request with a non-trivial compute budget.

Unchanged: the CSP (`connect-src 'self'` now covers the API), `apiClient.js`, and every
backend route. If a separate origin is ever wanted for operational reasons, B becomes
valid — but it costs the CORS middleware and the CSP edit, so it must be a deliberate
decision, not a fallback.

---

## Decision log

| Date | Decision | Outcome |
|---|---|---|
| 2026-11-02 | D1 hop host | One host (Python); `whirlpool_timeline` becomes a declared output |
| 2026-11-02 | D2 water stub | Dissolved; stub becomes a tests-only double |
| 2026-11-02 | D5 documentation retirements | Decided — retire/fold/merge/archive as listed in plan §6 |
| 2026-11-02 | D6 ownership index | Decided — keep header + installers + cross-owner reads (~75 lines); dump on demand |
| 2026-11-02 | D7 test double | Shape-only |
| 2026-11-02 | D8 API origin | **Decided — A, same-origin Hosting rewrite to Cloud Run** (see D8) |
| 2026-11-02 | D3 labels | **Decided — A now, D as W3B** (generated registry; see D3) |
| 2026-11-02 | D4 UI depth | **Decided — 2a now, 2b gated on the four post-2a measurements; 2a′/2c rejected** (see D4) |
