// Step-view composition root: binds Alpine to the field-model producer. The
// view binds to field models; only this adapter and the producer touch the
// engine. Session, boundary runner, draft editor, unit actions, snapshot, and
// field actions own their respective seams; this module wires them together.
//
// Alpine reactivity: methods mutate `this` (the Alpine reactive proxy), never the
// raw object, so the view re-renders on every change. `main.js` wraps the app in
// `Alpine.reactive` and binds that proxy to persistence.
import artifact from "../engine/artifact.json" with { type: "json" };
import { createSession } from "./session.js";
import { resolveBoundarySeam } from "./boundarySeam.js";
import { assertReferencePair, createReferenceCache } from "../store/referenceCache.js";
import { identityDerivations } from "../views/seedDerivations.js";
import { EQUAL_SUGAR_PARTS } from "../views/producer/sugarAllocation.js";
import { migrateChecklistCollections } from "../views/checklist/catalog.js";
import { dropLegacyDoughIn, migrateWhirlpoolCoordinates } from "./legacyMigrations.js";
import { createLibrary } from "../store/library.js";
import { CATALOGS, isUserItem } from "../store/userCatalog.js";
import { createAppStore } from "../store/index.js";
import { loadUnitMode } from "../store/unitPrefs.js";
import { createSnapshotActions } from "../store/snapshot.js";
import { registerYeastCard } from "./cards/yeast.js";
import { registerStyleCard } from "./cards/style.js";
import { registerHopCard } from "./cards/hops.js";
import { installHopStrategy } from "./cards/hopsStrategy.js";
import { registerLateAdditionsCard } from "./cards/late-additions.js";
import { registerTraceMaltsCard } from "./cards/trace-malts.js";
import { registerMaltCard } from "./cards/malt.js";
import { registerMashCard } from "./cards/mash.js";
import { registerBrewDayCard } from "./cards/brew-day.js";
import { registerDryHopCard } from "./cards/dry-hops.js";
import { registerWaterCard } from "./cards/water.js";
import { createCatalogRegistry } from "./cards/catalogChrome.js";
import { registerLibraryUi } from "./libraryUi.js";
import { registry, steps } from "../views/steps.js";
import { UNIT_DIMENSIONS, UNIT_GROUPS } from "../views/registry/units.js";
import { createBoundaryRunner } from "./boundaryRunner.js";
import { bindGate, waterTargetGate } from "./waterGate.js";
import { createFieldAttribution } from "./fieldAttribution.js";
import { createFieldActions } from "./fieldActions.js";
import { createDraftEditor } from "./draftEditor.js";
import { createUnitActions } from "./unitActions.js";
import { createNavigationActions } from "./navigation.js";
import { createModalFocusManager } from "./modalFocus.js";
import { createStepView } from "./stepView.js";
import { assertNoCollisions, BASE_KEYS, composeLayers, installerSurfaceGaps } from "./contract.js";
import { INSTALLERS } from "./installers.js";
import * as fmt from "../utils.js";
import { createObservabilityManager } from "../observability.js";

// Pre-landing-page bootstrap: the seed default equipment, no water source, no
// style. The landing page replaces this with the batch's identity snapshot.
function bootstrapIdentity(artifactSpec, cache) {
  const equipmentId = artifactSpec.constants?.default_equipment_profile_id?.value;
  return {
    equipment: cache.references.equipment?.[equipmentId] ?? {},
    "water.source": {},
    style: {},
  };
}

// Reference assets: the browser entry owns the cache and the library that fills
// it, and injects both. A bare test app falls back to a fresh pair.
function referenceAssets(options, observability, onChange) {
  const cache = options.cache ?? createReferenceCache();
  const library = options.library ?? createLibrary({
    client: options.libraryClient,
    onChange,
    observability,
  });
  return { cache, library };
}

// Runtime seams the browser owns: one focus manager and one observability
// manager per app instance. Tests may inject either.
function runtimeSeams(options) {
  return {
    modalFocus: options.modalFocus ?? createModalFocusManager(),
    observability: options.observability ?? createObservabilityManager(),
  };
}

const CARD_INSTALLERS = [
  registerYeastCard, registerStyleCard, registerHopCard, registerLateAdditionsCard,
  registerTraceMaltsCard, registerMaltCard, registerMashCard, registerBrewDayCard,
  registerDryHopCard, registerWaterCard, registerLibraryUi, installHopStrategy,
];

export function createStepApp(options = {}) {
  assertReferencePair(options);
  const { master, ui, initialRoots } = createAppStore();
  ui.unitMode = loadUnitMode(artifact);
  const { modalFocus, observability } = runtimeSeams(options);
  const { cache, library } = referenceAssets(options, observability, () => syncLibrary());
  cache.syncLibraryItems(library.items());

  const { boundaries, remote } = resolveBoundarySeam(options);
  const fetchImpl = options.fetchImpl;
  const debounceMs = options.debounceMs ?? 300;

  const identity = options.identity ?? bootstrapIdentity(artifact, cache);
  const session = createSession({ artifact, cache, master, initialRoots, boundaries, identity });

  const attribution = createFieldAttribution(artifact, steps);
  const relationDefs = Object.fromEntries((artifact.relations ?? []).map((r) => [r.id, r]));
  // The pristine auth-scoped baseline to restore on sign-out.
  const baselineRoots = master.allRoots();

  // The live view is the composed app, rebound to Alpine's reactive wrapper once
  // main.js wraps it. Composition and installation never write through it; only
  // handlers read it, so their writes land on the proxy Alpine observes.
  const liveView = { current: null };
  const getView = () => liveView.current;

  // Shared context for the per-card modules (cards/<name>.js). Cards attach
  // reactive state/handlers before main.js wraps the app in Alpine.reactive.
  const cardCtx = {
    engine: session.engine,
    cache,
    ui,
    artifact,
    getView,
    modalFocus,
    observability,
    registry: createCatalogRegistry(),
  };

  const baseApp = {
    master,
    engine: session.engine,
    library,
    observability,
    steps,
    fmt,
    activeIndex: ui.activeIndex,
    highwater: ui.highwater,
    activeStep: steps[ui.activeIndex],
    visibleSteps: [],
    navDir: null, // "next" | "prev" — drives the step-card entry animation
    stepStatus: attribution.initialStepStatus,
    unitDimensions: UNIT_DIMENSIONS,
    unitGroups: UNIT_GROUPS,
    unitMode: ui.unitMode,
    unitsOpen: false,
    violationCount: 0,
    catalogRevision: 0,
    libraryRevision: 0,
    fieldsBySlice: {},
    fieldsById: {},
    relations: [],
    findings: [],
    findingsById: {},
    pinFindingAvailable: false,
    domains: [],
    onChange: null, // optional browser hook, called after each state mutation
    boundaryStatuses: Object.fromEntries(
      session.boundaryNodes.map((id) => [id, remote ? "pending" : "ok"])
    ),
    boundaryError: null,
    boundaryExtras: Object.fromEntries(session.boundaryNodes.map((id) => [id, null])),
    boundaryBlocked: {},

    // The browser wraps this object in Alpine.reactive. The runner, its status
    // callback, and every factory handler resolve the reactive instance through
    // `liveView` (see `bindReactive`).
    bindReactive(proxy) {
      liveView.current = proxy;
    },

    get boundaryPending() {
      return remote && session.boundaryNodes.some((id) => this.boundaryStatuses[id] === "pending");
    },

    get boundaryBlockedMessage() {
      return Object.values(this.boundaryBlocked ?? {}).find(Boolean) ?? "";
    },

    get waterTelemetry() {
      return this.boundaryExtras?.["solver.water"] ?? null;
    },

    // Entry animation class for the active card, keyed by nav direction. Empty
    // until the first navigation so the initial card doesn't animate.
    get navClass() {
      if (this.navDir === "next") return "step-enter-down";
      if (this.navDir === "prev") return "step-enter-up";
      return "";
    },

    notify() {
      this.onChange?.();
    },

    // Replace the editable state (draft restore / open). The session rebuilds
    // the engine from the loaded roots/collections/selections; default
    // collections fall back to the seed cache when the draft predates them.
    // A selection whose snapshot is missing (legacy draft) is materialised from
    // the current library and marked dirty so the next save persists it.
    async loadState(state) {
      this.inputDrafts = {};
      this.hopStrategy = state?.hop_strategy;
      const legacyDerate = state?.roots?.["batch.attenuation_derate"];
      const migratedChecklist = migrateChecklistCollections(state?.collections);
      session.rebuild({ ...state, collections: migratedChecklist.collections });
      const migratedDerate = this.migrateAttenuationDerate(legacyDerate);
      this.onBatchLoad?.();
      const migrated = dropLegacyDoughIn(session.engine);
      const migratedWhirlpool = migrateWhirlpoolCoordinates(session.engine);
      const seeded = this.seedIdentityResiduals();
      const materialized = this.materializeSelections();
      const synced = this.syncWaterTargets?.() ?? false;
      const sugarParts = this.seedSugarShareParts();
      if (remote) await this.solveNow();
      else this.compute();
      const changed = [
        seeded, materialized, synced, migrated, migratedWhirlpool,
        migratedChecklist.changed, migratedDerate, sugarParts,
      ].some(Boolean);
      if (changed) this.notify();
      this.resetToStyle();
    },

    // A saved batch can author a positive sugar share while every row's parts
    // are still zero (rows predate the catalog's equal-weight default). The
    // solver honors the share, so a zero-weight table would show 0 lb of sugar
    // beside a real extract budget. Give that unmigrated state equal weights.
    // This runs before the first solve, so the rows are read authored: a
    // computed row field may read the batch boundary, which has no result yet.
    seedSugarShareParts() {
      if (session.engine.get("batch.late_addition_intent") !== "share") return false;
      const share = Number(session.engine.get("batch.sugar_extract_share")) || 0;
      if (!(share > 0)) return false;
      const rows = session.engine.getAuthored("batch.sugars");
      if (!Array.isArray(rows) || rows.length === 0) return false;
      const total = rows.reduce((sum, row) => sum + (Number(row.parts) || 0), 0);
      if (total > 0) return false;
      session.engine.setCollection(
        "batch.sugars",
        rows.map((row) => ({ ...row, parts: EQUAL_SUGAR_PARTS }))
      );
      return true;
    },

    // Drafts saved before the derate became points stored a multiplier of the
    // strain maximum. Convert it once, using the selected strain's published
    // attenuation; the old root is dropped by the rebuild.
    migrateAttenuationDerate(legacy) {
      if (typeof legacy !== "number" || !Number.isFinite(legacy)) return false;
      if (this.master.getRoot("batch.attenuation_derate_points") !== undefined) return false;
      const aa = session.engine.resolve("batch.yeast.attenuation_pct");
      if (typeof aa !== "number" || !Number.isFinite(aa)) return false;
      const points = Math.min(0.25, Math.max(0, (1 - legacy) * aa));
      this.setRoot("batch.attenuation_derate_points", points);
      return true;
    },

    // Seed the creation-time residuals from the batch's identity snapshot when
    // the draft does not already carry them. Identity is read-only in the
    // workspace, so this is the only place the residual roots are derived.
    seedIdentityResiduals() {
      let changed = false;
      for (const [namespace, component] of Object.entries(session.identity() ?? {})) {
        if (!component || Object.keys(component).length === 0) continue;
        for (const { rootId, derive } of identityDerivations(namespace)) {
          if (master.getRoot(rootId) !== undefined) continue;
          const value = derive(component);
          if (typeof value === "number" || (typeof value === "string" && value !== "")) {
            this.setRoot(rootId, value);
            changed = true;
          }
        }
      }
      return changed;
    },

    // Copy every referenced component into the batch when it lacks a snapshot.
    // Returns true when anything was materialised.
    materializeSelections() {
      const engine = session.getEngine();
      const snapshots = session.selections();
      let changed = false;
      for (const [id, node] of Object.entries(artifact.nodes)) {
        if (node.kind !== "selection" || snapshots[id]) continue;
        let refValue;
        try {
          refValue = engine.get(node.ref);
        } catch (err) {
          observability.reportError("stepAdapter.materializeSelections", err);
          continue;
        }
        if (!refValue) continue;
        const component = cache.references[node.output?.schema]?.[refValue];
        if (!component) continue;
        session.setSelection(id, component);
        changed = true;
      }
      return changed;
    },

    // Copy the chosen component into the batch's selection snapshot and clear
    // it when the reference root is emptied.
    pickSelection(refRootId, refValue) {
      const selectionNode = attribution.refToSelectionMap.get(refRootId);
      if (!selectionNode) return;
      const node = artifact.nodes[selectionNode];
      const component = refValue ? cache.references[node.output?.schema]?.[refValue] : null;
      session.setSelection(selectionNode, component ?? null);
    },

    setRoot(nodeId, value) {
      session.engine.setRoot(nodeId, value);
    },

    unsetRoot(nodeId) {
      session.engine.unsetRoot(nodeId);
    },

    // The runner owns debounce, supersession, dedupe, and status/error state.
    solveNow() {
      return runner.solveNow();
    },

    scheduleSolve() {
      runner.scheduleSolve();
    },

    compute() {
      view.compute(this);
      this.afterCompute?.();
    },

    // The shared reference cache was replaced by the library overlay; point the
    // live engine at the new maps.
    refreshReferences() {
      session.engine.setReferences(cache.references);
    },

    // Re-merge library records into the cache/engine and re-render. Called by
    // the library surface after a mutation. The cache swaps in a new catalogue
    // snapshot and hands it to the engine, which re-resolves ingredient priors
    // and drops its memo (a record may be referenced by any selection); the
    // revision counters are the reactive signals the picker and library getters
    // depend on. In HTTP mode the boundary result must be (re)resolved before
    // compute, exactly like `loadState`/`boot`; `solveNow` computes internally.
    async refreshLibraryItems() {
      syncLibrary();
      this.catalogRevision += 1;
      this.libraryRevision += 1;
      if (remote) await this.solveNow();
      else this.compute();
    },

    // True when the id is user-authored (legacy `u:` seed copy or a server
    // library record) — drives the picker "mine" badge.
    isUserItem(id) {
      return isUserItem(id) || cache.isLibraryItem(id);
    },

    // Copy a seed component into a new server record.
    async duplicateUserItem(catalog, component) {
      const meta = CATALOGS[catalog];
      if (!meta) return;
      const copy = { ...component };
      delete copy[meta.idField];
      try {
        await this.library.create(catalog, copy);
        await this.refreshLibraryItems();
      } catch (err) {
        observability.reportError(`stepAdapter.duplicate ${catalog}`, err);
      }
    },

    // Test/conformance entry point. Production boot is auth-driven via
    // `applyAuth` in main.js, which loads state before entering the editor.
    // Deliberately NOT named `init`: Alpine auto-calls an `init()` method on
    // `x-data` objects, which would run a solve before sign-in (and 401).
    async boot() {
      this.syncWaterTargets?.();
      await this.solveNow();
      this.library
        .refresh()
        .then(() => this.refreshLibraryItems())
        .catch((err) => observability.reportError("stepAdapter.libraryRefresh", err));
      this.syncNav();
    },

    // Reset to the pristine auth-scoped baseline (sign-out). The runner discards
    // any in-flight solve and the session rebuilds from the seed cache; unit
    // prefs are device-local and deliberately preserved. In HTTP mode the reset
    // engine has no boundary result yet, so skip compute (the editor is
    // unmounted while signed out and re-solves on the next loadState/boot).
    teardown() {
      this.inputDrafts = {};
      runner.reset();
      session.reset(baselineRoots);
      ui.activeIndex = 0;
      ui.highwater = 0;
      this.syncNav();
      if (!remote) this.compute();
    },
  };

  // Explicit composition: each factory receives the dependencies it needs, and
  // the merged layers are the app's installer surface.
  const core = { artifact, session, getView };
  const app = composeLayers(
    baseApp,
    { dialogFocus: modalFocus.dialogFocus },
    createNavigationActions({ ui, steps, isEditorActive: options.isEditorActive, getView }),
    createFieldActions({ ...core, observability, refToSelectionMap: attribution.refToSelectionMap }),
    createDraftEditor({ ...core, ui, observability }),
    createUnitActions({ ...core, ui, observability }),
    createSnapshotActions({ ...core, master, observability })
  );
  liveView.current = app;

  const view = createStepView({
    artifact,
    steps,
    registry,
    cache,
    ui,
    session,
    observability,
    relationDefs,
    attribution,
  });

  const runner = createBoundaryRunner({
    session,
    remote,
    gate: bindGate(waterTargetGate),
    preGate: (id, engine) => {
      if (id !== "solver.batch") return null;
      const cap = engine.resolve("batch.yeast_cap");
      return Number.isFinite(cap) && cap > 0 ? null : "Select a yeast to solve the batch.";
    },
    api: options.api,
    fetchImpl,
    debounceMs,
    compute: () => liveView.current.compute(),
    onState: ({ statuses, error, extras, blocked }) => {
      const target = liveView.current;
      target.boundaryStatuses = statuses;
      target.boundaryError = fmt.boundaryErrorView(error);
      target.boundaryExtras = extras;
      target.boundaryBlocked = blocked;
    },
  });

  // A normal (configurable) data property: the browser wraps the app in
  // `Alpine.reactive`, whose get returns an object value as a reactive proxy —
  // which the JS proxy invariant refuses for a locked-down data property. The
  // array is only read on the raw app today, but the lock would make any future
  // `this[BASE_KEYS]` read throw.
  Object.defineProperty(app, BASE_KEYS, {
    value: Object.keys(baseApp),
    enumerable: false,
    configurable: true,
  });

  for (const register of CARD_INSTALLERS) {
    register(app, cardCtx);
  }

  function syncLibrary() {
    const { references } = cache.syncLibraryItems(library.items());
    session.engine.setReferences(references);
  }

  if (import.meta.env?.DEV) {
    assertNoCollisions(INSTALLERS);
    const { undeclared, missing } = installerSurfaceGaps(app, INSTALLERS);
    const problems = [
      ...undeclared.map((key) => `app member not declared by any installer: ${key}`),
      ...missing.map((key) => `declared but never assigned: ${key}`),
    ];
    if (problems.length) throw new Error(`installer surface drift:\n${problems.join("\n")}`);
  }

  return app;
}
