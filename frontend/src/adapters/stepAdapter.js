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
import { createReferenceCache } from "../store/referenceCache.js";
import { identityDerivations } from "../views/seedDerivations.js";
import { createLibrary } from "../store/library.js";
import { CATALOGS, isUserItem } from "../store/userCatalog.js";
import { createAppStore } from "../store/index.js";
import { loadUnitMode } from "../store/unitPrefs.js";
import { installSnapshot } from "../store/snapshot.js";
import { registerYeastCard } from "./cards/yeast.js";
import { registerStyleCard } from "./cards/style.js";
import { registerHopCard } from "./cards/hops.js";
import { registerLateAdditionsCard } from "./cards/late-additions.js";
import { registerTraceMaltsCard } from "./cards/trace-malts.js";
import { registerMaltCard } from "./cards/malt.js";
import { registerMashCard } from "./cards/mash.js";
import { registerBrewDayCard } from "./cards/brew-day.js";
import { registerWaterCard } from "./cards/water.js";
import { registerLibraryUi } from "./libraryUi.js";
import { registry, steps } from "../views/steps.js";
import { UNIT_DIMENSIONS, UNIT_GROUPS } from "../views/registry/units.js";
import { createBoundaryRunner } from "./boundaryRunner.js";
import { bindGate, waterTargetGate } from "./waterGate.js";
import { createFieldAttribution } from "./fieldAttribution.js";
import { installFieldActions } from "./fieldActions.js";
import { installDraftEditor } from "./draftEditor.js";
import { installUnitActions } from "./unitActions.js";
import { installNavigation } from "./navigation.js";
import { dialogFocus } from "./modalFocus.js";
import { createStepView } from "./stepView.js";
import { assertNoCollisions, BASE_KEYS, installerSurfaceGaps } from "./contract.js";
import { INSTALLERS } from "./installers.js";
import * as fmt from "../utils.js";
import { reportError } from "../observability.js";

// Pre-landing-page bootstrap: the seed default equipment, no water source, no
// style. The landing page replaces this with the batch's identity snapshot.
function bootstrapIdentity(artifact, cache) {
  const equipmentId = artifact.constants?.default_equipment_profile_id?.value;
  return {
    equipment: cache.references.equipment?.[equipmentId] ?? {},
    "water.source": {},
    style: {},
  };
}

export function createStepApp(options = {}) {
  const { master, ui } = createAppStore();
  ui.unitMode = loadUnitMode(artifact);
  const cache = createReferenceCache();
  const library = createLibrary({
    client: options.libraryClient,
    onChange: () => syncLibrary(),
  });
  cache.syncLibraryItems(library.items());

  // Boundary seam: offline stubs by default (tests, no API base); the real
  // solvers over HTTP when explicitly enabled. HTTP is an explicit boolean
  // (never the truthiness of the base string); main.js passes `useHttp: true`.
  const useHttp = options.useHttp ?? false;
  const fetchImpl = options.fetchImpl;
  const debounceMs = options.debounceMs ?? 300;

  const identity = options.identity ?? bootstrapIdentity(artifact, cache);
  const session = createSession({ artifact, cache, master, useHttp, identity });

  function dropLegacyDoughIn() {
    const rests = session.engine.get("mash.rests");
    if (!Array.isArray(rests)) return false;
    const filtered = rests.filter((rest) => rest?.rest_id !== "dough_in");
    if (filtered.length === rests.length) return false;
    session.engine.setCollection("mash.rests", filtered);
    return true;
  }
  const attribution = createFieldAttribution(artifact, steps);
  const relationDefs = Object.fromEntries((artifact.relations ?? []).map((r) => [r.id, r]));
  // The pristine auth-scoped baseline to restore on sign-out.
  const baselineRoots = master.allRoots();
  let reactiveApp;

  // Shared context for the per-card modules (cards/<name>.js). Cards attach
  // reactive state/handlers onto `app` before main.js wraps it in Alpine.reactive.
  const cardCtx = { engine: session.engine, cache, ui, artifact };

  const app = {
    master,
    engine: session.engine,
    library,
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
    domains: [],
    onChange: null, // optional browser hook, called after each state mutation
    boundaryStatuses: Object.fromEntries(
      session.boundaryNodes.map((id) => [id, useHttp ? "pending" : "ok"])
    ),
    boundaryError: null,
    boundaryExtras: Object.fromEntries(
      session.boundaryNodes.map((id) => [id, null])
    ),
    boundaryBlocked: {},

    // The browser wraps this object in Alpine.reactive. The runner and its
    // status callback are created below, outside that proxy, so point them at
    // the reactive instance explicitly (see `bindReactive`).
    bindReactive(proxy) {
      reactiveApp = proxy;
    },

    get boundaryPending() {
      return useHttp && session.boundaryNodes.some((id) => this.boundaryStatuses[id] === "pending");
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
      session.rebuild(state);
      this.onBatchLoad?.();
      const migrated = dropLegacyDoughIn();
      const seeded = this.seedIdentityResiduals();
      const materialized = this.materializeSelections();
      const synced = this.syncWaterTargets?.() ?? false;
      if (useHttp) await this.solveNow();
      else this.compute();
      if (seeded || materialized || synced || migrated) this.notify();
      this.syncNav();
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
          reportError("stepAdapter.materializeSelections", err);
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
      master.setRoot(nodeId, value);
      session.engine.setRoot(nodeId, value);
    },

    unsetRoot(nodeId) {
      master.unsetRoot(nodeId);
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

    // Re-merge library records into the cache/engine and re-render. Called by
    // the library surface after a mutation. Every selection is invalidated (a
    // record may be referenced by any of them) so the memoized valuation
    // re-resolves against the updated overlay; the revision counters are the
    // reactive signals the picker and library getters depend on. In HTTP mode
    // the boundary result must be (re)resolved before compute, exactly like
    // `loadState`/`boot`; `solveNow` computes internally.
    async refreshLibraryItems() {
      syncLibrary();
      this.catalogRevision += 1;
      this.libraryRevision += 1;
      if (useHttp) await this.solveNow();
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
        console.error(`duplicate ${catalog} failed`, err);
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
        .catch((err) => console.error("library refresh failed", err));
      this.syncNav();
    },

    // Reset to the pristine auth-scoped baseline (sign-out). The runner discards
    // any in-flight solve and the session rebuilds from the seed cache; unit
    // prefs are device-local and deliberately preserved. In HTTP mode the reset
    // engine has no boundary result yet, so skip compute (the editor is
    // unmounted while signed out and re-solves on the next loadState/boot).
    teardown() {
      runner.reset();
      session.reset(baselineRoots);
      ui.activeIndex = 0;
      ui.highwater = 0;
      this.syncNav();
      if (!useHttp) this.compute();
    },
  };

  const view = createStepView({
    artifact,
    steps,
    registry,
    cache,
    ui,
    session,
    cardCtx,
    relationDefs,
    attribution,
  });

  const runner = createBoundaryRunner({
    session,
    useHttp,
    gate: bindGate(waterTargetGate),
    preGate: (id, engine) => {
      if (id !== "solver.batch") return null;
      const cap = engine.resolve("batch.yeast_cap");
      return Number.isFinite(cap) && cap > 0 ? null : "Select a yeast to solve the batch.";
    },
    fetchImpl,
    debounceMs,
    compute: () => (reactiveApp ?? app).compute(),
    onState: ({ statuses, error, extras, blocked }) => {
      const target = reactiveApp ?? app;
      target.boundaryStatuses = statuses;
      target.boundaryError = error;
      target.boundaryExtras = extras;
      target.boundaryBlocked = blocked;
    },
  });

  Object.defineProperty(app, BASE_KEYS, { value: Object.keys(app), enumerable: false });

  installNavigation(app, { ui, steps });
  app.dialogFocus = dialogFocus;
  installFieldActions(app, {
    artifact,
    session,
    refToSelectionMap: attribution.refToSelectionMap,
  });
  installDraftEditor(app, { artifact, ui, session });
  installUnitActions(app, { artifact, ui });
  installSnapshot(app, { artifact, cache, master, session });

  registerYeastCard(app, cardCtx);
  registerStyleCard(app, cardCtx);
  registerHopCard(app, cardCtx);
  registerLateAdditionsCard(app, cardCtx);
  registerTraceMaltsCard(app, cardCtx);
  registerMaltCard(app, cardCtx);
  registerMashCard(app, cardCtx);
  registerBrewDayCard(app, cardCtx);
  registerWaterCard(app, cardCtx);
  registerLibraryUi(app, cardCtx);

  function syncLibrary() {
    cache.syncLibraryItems(library.items());
    for (const [id, node] of Object.entries(artifact.nodes)) {
      if (node.kind === "selection") session.engine.invalidate(id);
    }
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
