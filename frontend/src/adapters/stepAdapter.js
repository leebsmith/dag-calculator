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
import { registerLibraryUi } from "./libraryUi.js";
import { registry, steps } from "../views/steps.js";
import { UNIT_DIMENSIONS, UNIT_GROUPS } from "../views/registry/units.js";
import { createBoundaryRunner } from "./boundaryRunner.js";
import { createFieldAttribution } from "./fieldAttribution.js";
import { installFieldActions } from "./fieldActions.js";
import { installDraftEditor } from "./draftEditor.js";
import { installUnitActions } from "./unitActions.js";
import { installNavigation } from "./navigation.js";
import { createStepView } from "./stepView.js";
import { assertNoCollisions } from "./contract.js";
import { KEYS as navigationKeys } from "./navigation.js";
import { KEYS as fieldActionsKeys } from "./fieldActions.js";
import { KEYS as draftEditorKeys } from "./draftEditor.js";
import { KEYS as unitActionsKeys } from "./unitActions.js";
import { KEYS as snapshotKeys } from "../store/snapshot.js";
import { KEYS as libraryUiKeys } from "./libraryUi.js";
import { KEYS as yeastKeys } from "./cards/yeast.js";
import { KEYS as styleKeys } from "./cards/style.js";
import { KEYS as hopKeys } from "./cards/hops.js";
import { KEYS as lateAdditionsKeys } from "./cards/late-additions.js";
import { KEYS as traceMaltsKeys } from "./cards/trace-malts.js";
import { KEYS as maltKeys } from "./cards/malt.js";
import { KEYS as mashKeys } from "./cards/mash.js";
import { KEYS as brewDayKeys } from "./cards/brew-day.js";
import * as fmt from "../utils.js";
import { reportError } from "../observability.js";

// Declared installer contract: each module exports the app members it assigns.
// The single reactive root is a deliberate Alpine requirement; this check just
// makes name collisions loud in development instead of silently clobbering state.
const INSTALLERS = [
  { name: "navigation", keys: navigationKeys },
  { name: "fieldActions", keys: fieldActionsKeys },
  { name: "draftEditor", keys: draftEditorKeys },
  { name: "unitActions", keys: unitActionsKeys },
  { name: "snapshot", keys: snapshotKeys },
  { name: "libraryUi", keys: libraryUiKeys },
  { name: "yeast", keys: yeastKeys },
  { name: "style", keys: styleKeys },
  { name: "hop", keys: hopKeys },
  { name: "lateAdditions", keys: lateAdditionsKeys },
  { name: "traceMalts", keys: traceMaltsKeys },
  { name: "malt", keys: maltKeys },
  { name: "mash", keys: mashKeys },
  { name: "brewDay", keys: brewDayKeys },
];

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

  const session = createSession({ artifact, cache, master, useHttp });
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

    // The browser wraps this object in Alpine.reactive. The runner and its
    // status callback are created below, outside that proxy, so point them at
    // the reactive instance explicitly (see `bindReactive`).
    bindReactive(proxy) {
      reactiveApp = proxy;
    },

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
    // the engine from the loaded roots/collections/selections; default
    // collections fall back to the seed cache when the draft predates them.
    // A selection whose snapshot is missing (legacy draft) is materialised from
    // the current library and marked dirty so the next save persists it.
    async loadState(state) {
      session.rebuild(state);
      if (useHttp) await this.solveNow();
      else this.compute();
      if (this.materializeSelections()) this.notify();
      this.syncNav();
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
        const component = cache.references[node.schema]?.[refValue];
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
      const component = refValue ? cache.references[node.schema]?.[refValue] : null;
      session.setSelection(selectionNode, component ?? null);
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

    // Re-merge library records into the cache/engine and re-render. Called by
    // the library surface after a mutation. Every selection is invalidated (a
    // record may be referenced by any of them) so the memoized valuation
    // re-resolves against the updated overlay; the revision counters are the
    // reactive signals the picker and library getters depend on.
    refreshLibraryItems() {
      syncLibrary();
      this.catalogRevision += 1;
      this.libraryRevision += 1;
      this.compute();
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
        this.refreshLibraryItems();
      } catch (err) {
        console.error(`duplicate ${catalog} failed`, err);
      }
    },

    // Test/conformance entry point. Production boot is auth-driven via
    // `applyAuth` in main.js, which loads state before entering the editor.
    // Deliberately NOT named `init`: Alpine auto-calls an `init()` method on
    // `x-data` objects, which would run a solve before sign-in (and 401).
    async boot() {
      if (useHttp) await this.solveNow();
      else this.compute();
      this.library
        .refresh()
        .then(() => this.refreshLibraryItems())
        .catch((err) => console.error("library refresh failed", err));
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
    compute: () => (reactiveApp ?? app).compute(),
    onState: ({ statuses, error }) => {
      const target = reactiveApp ?? app;
      target.boundaryStatuses = statuses;
      target.boundaryError = error;
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
  registerBrewDayCard(app, cardCtx);
  registerLibraryUi(app, cardCtx);

  function syncLibrary() {
    cache.syncLibraryItems(library.items());
    for (const [id, node] of Object.entries(artifact.nodes)) {
      if (node.kind === "selection") session.engine.invalidate(id);
    }
  }

  if (import.meta.env?.DEV) {
    assertNoCollisions(INSTALLERS);
  }

  return app;
}
