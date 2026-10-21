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
import { createUserCatalog, isUserItem } from "../store/userCatalog.js";
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
import { registerUserCatalogUi } from "./userCatalogUi.js";
import { registry, steps } from "../views/steps.js";
import { UNIT_DIMENSIONS, UNIT_GROUPS } from "../views/registry/units.js";
import { createBoundaryRunner } from "./boundaryRunner.js";
import { createFieldAttribution } from "./fieldAttribution.js";
import { installFieldActions } from "./fieldActions.js";
import { installDraftEditor } from "./draftEditor.js";
import { installUnitActions } from "./unitActions.js";
import { installNavigation } from "./navigation.js";
import { createStepView } from "./stepView.js";

export function createStepApp(options = {}) {
  const { master, ui } = createAppStore();
  ui.unitMode = loadUnitMode(artifact);
  const cache = createReferenceCache();
  const userCatalog = createUserCatalog({ artifact });
  cache.syncUserItems(userCatalog.catalogs);

  // Boundary seam: offline stubs by default (tests, no API base); the real
  // solvers over HTTP when explicitly enabled. HTTP is an explicit boolean
  // (never the truthiness of the base string); main.js passes `useHttp: true`.
  const useHttp = options.useHttp ?? false;
  const fetchImpl = options.fetchImpl;
  const debounceMs = options.debounceMs ?? 300;

  const session = createSession({ artifact, cache, master, useHttp });
  const attribution = createFieldAttribution(artifact, steps);
  const relationDefs = Object.fromEntries((artifact.relations ?? []).map((r) => [r.id, r]));
  // The pristine auth-scoped baseline to restore on sign-out.
  const baselineRoots = master.allRoots();

  // Shared context for the per-card modules (cards/<name>.js). Cards attach
  // reactive state/handlers onto `app` before main.js wraps it in Alpine.reactive.
  const cardCtx = { engine: session.engine, cache, ui, artifact };

  const app = {
    master,
    userCatalog,
    steps,
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
    fieldsBySlice: {},
    relations: [],
    domains: [],
    onChange: null, // optional browser hook, called after each state mutation
    boundaryStatuses: Object.fromEntries(
      session.boundaryNodes.map((id) => [id, useHttp ? "pending" : "ok"])
    ),
    boundaryError: null,

    get boundaryPending() {
      return useHttp && session.boundaryNodes.some((id) => this.boundaryStatuses[id] === "pending");
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
    // the engine from the loaded roots/collections; default collections fall
    // back to the seed cache when the draft predates them.
    async loadState(state) {
      session.rebuild(state);
      if (useHttp) await this.solveNow();
      else this.compute();
      this.syncNav();
    },

    setRoot(nodeId, value) {
      master.setRoot(nodeId, value);
      session.engine.setRoot(nodeId, value);
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
    },

    // Re-merge user-authored items into the cache/engine and re-render. Called
    // by the catalog CRUD surface after a mutation. Every selection is
    // invalidated (a user item may be referenced by any of them) so the memoized
    // valuation re-resolves against the updated overlay; `catalogRevision` is the
    // reactive signal the picker getters depend on.
    refreshUserItems() {
      cache.syncUserItems(userCatalog.catalogs);
      for (const [id, node] of Object.entries(artifact.nodes)) {
        if (node.kind === "selection") session.engine.invalidate(id);
      }
      this.catalogRevision += 1;
      this.compute();
    },

    // True when the id is a user-authored (`u:`) item (picker badge).
    isUserItem(id) {
      return isUserItem(id);
    },

    // Clone a seed component into a user-authored item, then refresh the overlay.
    duplicateUserItem(catalog, component) {
      try {
        this.userCatalog.duplicateFrom(catalog, component);
        this.refreshUserItems();
      } catch (err) {
        console.error(`duplicate ${catalog} failed`, err);
      }
    },

    // Explicit boot (main.js owns it after auth). Deliberately NOT named
    // `init`: Alpine auto-calls an `init()` method on `x-data` objects, which
    // would run a solve before sign-in (and 401).
    async boot() {
      if (useHttp) await this.solveNow();
      else this.compute();
      this.syncNav();
    },

    // Reset to the pristine auth-scoped baseline (sign-out). The runner discards
    // any in-flight solve and the session rebuilds from the seed cache; unit
    // prefs are device-local and deliberately preserved.
    teardown() {
      runner.reset();
      session.reset(baselineRoots);
      ui.activeIndex = 0;
      ui.highwater = 0;
      this.syncNav();
      this.compute();
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
    fetchImpl,
    debounceMs,
    compute: () => app.compute(),
    onState: ({ statuses, error }) => {
      app.boundaryStatuses = statuses;
      app.boundaryError = error;
    },
  });

  installNavigation(app, { ui, steps });
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
  registerUserCatalogUi(app, cardCtx);

  // Any user-item mutation keeps the cache + engine consistent (the CRUD surface
  // separately triggers refreshUserItems for the reactive re-render).
  userCatalog.onChange = () => {
    cache.syncUserItems(userCatalog.catalogs);
    for (const [id, node] of Object.entries(artifact.nodes)) {
      if (node.kind === "selection") session.engine.invalidate(id);
    }
  };

  return app;
}
