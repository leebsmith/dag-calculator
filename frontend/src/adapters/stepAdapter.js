// Step-view adapter: binds Alpine to the field-model producer. The view binds to
// field models; ONLY this adapter + the producer touch the engine. Boundary stubs
// are the default offline seam (HTTP is Step D's path).
//
// Alpine reactivity: methods mutate `this` (the Alpine reactive proxy), never the
// raw object, so the view re-renders on every change. `main.js` wraps the app in
// `Alpine.reactive` and binds that proxy to persistence.
import artifact from "../engine/artifact.json" with { type: "json" };
import { canonicalize, createCalculator, resolveReference, sha256Hex, toBase } from "../engine/index.js";
import { createReferenceCache } from "../store/referenceCache.js";
import { createUserCatalog, isUserItem } from "../store/userCatalog.js";
import { createAppStore } from "../store/index.js";
import { clearUnitMode, loadUnitMode, saveUnitMode } from "../store/unitPrefs.js";
import { produce, nonlinearFns, resolveCollectionColumns, displayValue } from "../views/producer.js";
import { hamiltonPct } from "../views/hamilton.js";
import { derivationsFor } from "../views/seedDerivations.js";
import { registerYeastCard, refreshYeastCard } from "./cards/yeast.js";
import { registerStyleCard, refreshStyleCard } from "./cards/style.js";
import { registerHopCard, refreshHopCard } from "./cards/hops.js";
import { registerLateAdditionsCard, refreshLateAdditionsCard } from "./cards/late-additions.js";
import { registerTraceMaltsCard, refreshTraceMaltsCard } from "./cards/trace-malts.js";
import { registerMaltCard, refreshMaltCard } from "./cards/malt.js";
import { registerMashCard, refreshMashCard } from "./cards/mash.js";
import { registerUserCatalogUi } from "./userCatalogUi.js";
import { registry, steps } from "../views/steps.js";
import { UNIT_DIMENSIONS, UNIT_GROUPS, UNIT_SYMBOLS } from "../views/registry/units.js";
import { flattenResponse, postJSON } from "./apiClient.js";
import { BOUNDARY_BUILDERS } from "./boundaryRequest.js";
import { STUB_BOUNDARIES } from "./stubBoundaries.js";

// The canonical key for a dotted path: the resolved node id plus its field
// suffix (e.g. "equipment.max_hlt_volume_l" -> "equipment.profile.max_hlt_volume_l").
function fieldKey(path) {
  const r = resolveReference(artifact, path);
  if (!r) return null;
  return r.suffix.length ? `${r.nodeId}.${r.suffix.join(".")}` : r.nodeId;
}

// Collect every `ref` path referenced by a predicate (tree of op/args/lhs/rhs/ref).
function refPaths(node, out = new Set()) {
  if (node === null || typeof node !== "object") return out;
  if ("ref" in node) out.add(node.ref);
  if (Array.isArray(node)) {
    for (const item of node) refPaths(item, out);
  } else {
    for (const value of Object.values(node)) refPaths(value, out);
  }
  return out;
}

// Map every manifest field to the step slice that displays it, keyed by
// `fieldKey`. Lets violations land on the card that owns the field.
function buildFieldSliceMap() {
  const map = new Map();
  for (const step of steps) {
    for (const entry of step.fields) {
      const id = typeof entry === "object" && entry.collection ? entry.collection : typeof entry === "string" ? entry : entry.id;
      if (!id) continue;
      const key = fieldKey(id);
      if (key && !map.has(key)) map.set(key, step.slice);
    }
  }
  return map;
}

// Selection reference root (e.g. "water.source_report_id") -> its selection node
// id (e.g. "water.source_report"), for the copy-in cascade.
function refToSelection(artifact) {
  const map = new Map();
  for (const [id, node] of Object.entries(artifact.nodes)) {
    if (node.kind === "selection") map.set(node.ref, id);
  }
  return map;
}


export function createStepApp(options = {}) {
  const { master, ui } = createAppStore();
  ui.unitMode = loadUnitMode(artifact);
  const cache = createReferenceCache();
  const userCatalog = createUserCatalog({ artifact });
  cache.syncUserItems(userCatalog.catalogs);
  let collections = { ...cache.collections };

  // Boundary seam: offline stubs by default (tests, no API base); the real
  // solvers over HTTP when explicitly enabled. The engine stays synchronous —
  // the adapter pre-resolves boundaries and seeds the cache before computing.
  // HTTP is an explicit boolean (never the truthiness of the base string); the
  // product entry (main.js) passes `useHttp: true`.
  const useHttp = options.useHttp ?? false;
  const fetchImpl = options.fetchImpl;
  const debounceMs = options.debounceMs ?? 300;
  const BOUNDARY_URLS = {
    batch_sparge_solver: "/solve/batch",
    water_chemistry_solver: "/solve/water",
  };

  let engine = createCalculator(artifact, {
    references: cache.references,
    collections,
    boundaries: useHttp ? {} : STUB_BOUNDARIES,
    boundaryRequests: BOUNDARY_BUILDERS,
    roots: master.allRoots(),
  });
  const boundaryNodes = engine.topoOrder.filter((id) => artifact.nodes[id].kind === "boundary");
  const inflight = new Map(); // fingerprint -> Promise
  let solveTimer = null;
  let solveToken = 0;

  const relationDefs = Object.fromEntries((artifact.relations ?? []).map((r) => [r.id, r]));
  const fieldSlice = buildFieldSliceMap();
  const refToSelectionMap = refToSelection(artifact);

  // Selection node -> the step that displays its picker (ref root). Fallback
  // attribution for a selection's field-level domains when the field itself is
  // not listed in the manifest (e.g. most equipment constants, water reports).
  const selectionSlice = (() => {
    const map = new Map();
    for (const step of steps) {
      for (const entry of step.fields) {
        const id = typeof entry === "string" ? entry : entry.id;
        if (!id) continue;
        for (const [selId, node] of Object.entries(artifact.nodes)) {
          if (node.kind === "selection" && node.ref === id) map.set(selId, step.slice);
        }
      }
    }
    return map;
  })();

  // The step slice a dotted path belongs to: its displayed field, else its
  // selection's picker step, else the path's leading segment.
  function sliceForPath(path) {
    const ref = resolveReference(artifact, path);
    return (
      fieldSlice.get(fieldKey(path)) ??
      (ref && selectionSlice.get(ref.nodeId)) ??
      path.split(".")[0]
    );
  }

  // Slices to surface a relation on: map each referenced path through the
  // manifest (so batch.yeast.* lands on the yeast card), falling back to the
  // selection's picker step then the path's leading segment.
  function relationSlices(predicate) {
    const slices = new Set();
    for (const path of refPaths(predicate)) slices.add(sliceForPath(path));
    return slices;
  }

  // Seeded from the manifest so the first paint — which runs before the first
  // (async) compute — can read `stepStatus[slice]` without racing.
  const initialStepStatus = Object.fromEntries(
    steps.map((step) => [step.slice, { relations: [], domains: [] }])
  );
  // The pristine auth-scoped baseline to restore on sign-out.
  const baselineRoots = master.allRoots();

  // Shared context for the per-card modules (cards/<name>.js). Cards attach
  // reactive state/handlers onto `app` before main.js wraps it in Alpine.reactive.
  const cardCtx = { engine, cache, ui, artifact };

  const app = {
    master,
    userCatalog,
    steps,
    activeIndex: ui.activeIndex,
    highwater: ui.highwater,
    activeStep: steps[ui.activeIndex],
    visibleSteps: [],
    navDir: null, // "next" | "prev" — drives the step-card entry animation
    stepStatus: initialStepStatus,
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
    boundaryStatuses: Object.fromEntries(boundaryNodes.map((id) => [id, useHttp ? "pending" : "ok"])),
    boundaryError: null,

    get boundaryPending() {
      return useHttp && boundaryNodes.some((id) => this.boundaryStatuses[id] === "pending");
    },

    // Entry animation class for the active card, keyed by nav direction. Empty
    // until the first navigation so the initial card doesn't animate.
    get navClass() {
      if (this.navDir === "next") return "step-enter-down";
      if (this.navDir === "prev") return "step-enter-up";
      return "";
    },

    // Editable-state snapshot (roots + collections) for draft autosave. The
    // engine mutates the `collections` closure in place, so this reflects the
    // live state.
    draftState() {
      return {
        roots: master.allRoots(),
        collections: { ...collections },
        schema_version: artifact.schema_version ?? 2,
      };
    },

    // Full valuation (node-id -> value for every node) + provenance (per
    // selection: source_template_id + content-hash of the referenced seed
    // component). Browser-computed — the backend only stores it.
    freezePayload() {
      const valuation = {};
      for (const id of engine.topoOrder) {
        const node = artifact.nodes[id];
        // A selection with no chosen component has no value (ref is "").
        if (node.kind === "selection") {
          const refValue = engine.get(node.ref);
          if (refValue === "" || refValue === undefined) {
            valuation[id] = null;
            continue;
          }
        }
        valuation[id] = engine.get(id);
      }
      const provenance = {};
      for (const [id, node] of Object.entries(artifact.nodes)) {
        if (node.kind !== "selection") continue;
        const refValue = engine.get(node.ref);
        if (refValue === "" || refValue === undefined) continue;
        const component = cache.references[node.schema]?.[refValue];
        provenance[id] = {
          source_template_id: refValue,
          source_revision: component ? sha256Hex(canonicalize(component)) : null,
        };
      }
      return {
        valuation,
        provenance,
        schema_version: artifact.schema_version ?? 2,
      };
    },

    // Compare a frozen batch's provenance hashes against the CURRENT seeds,
    // returning the selections whose referenced component has changed (or gone
    // missing) since freeze. Drift is explicit, never silent (seed-substrate §4).
    detectDrift(provenance) {
      const drift = [];
      for (const [selectionId, p] of Object.entries(provenance ?? {})) {
        const node = artifact.nodes[selectionId];
        if (!node || node.kind !== "selection") continue;
        const component = cache.references[node.schema]?.[p.source_template_id];
        if (!component) {
          drift.push({ selectionNodeId: selectionId, templateId: p.source_template_id, reason: "missing" });
          continue;
        }
        if (sha256Hex(canonicalize(component)) !== p.source_revision) {
          drift.push({ selectionNodeId: selectionId, templateId: p.source_template_id, reason: "changed" });
        }
      }
      return drift;
    },

    notify() {
      this.onChange?.();
    },

    // Replace the editable state (draft restore / open). Rebuilds the engine
    // from the loaded roots/collections; default collections fall back to the
    // seed cache when the draft predates them.
    async loadState(state) {
      master.replaceRoots(state?.roots ?? {});
      collections = { ...cache.collections, ...(state?.collections ?? {}) };
      engine = createCalculator(artifact, {
        references: cache.references,
        collections,
        boundaries: useHttp ? {} : STUB_BOUNDARIES,
        boundaryRequests: BOUNDARY_BUILDERS,
        roots: master.allRoots(),
      });
      if (useHttp) await this.solveNow();
      else this.compute();
      this.syncNav();
    },

    setRoot(nodeId, value) {
      master.setRoot(nodeId, value);
      engine.setRoot(nodeId, value);
    },

    // Resolve every boundary in topological order (via HTTP), then recompute.
    // `engine.boundaryRequest` delegates to `BOUNDARY_BUILDERS`, so `inputs` is
    // the adapted `BatchSolverRequest`/`WaterSolverRequest` body and
    // `fingerprint` is its canonical hash (matching the backend). Superseded
    // solves discard their (stale) result via the token.
    async solveNow() {
      if (!useHttp) {
        this.compute();
        return;
      }
      const token = ++solveToken;
      try {
        for (const id of boundaryNodes) {
          const { binding, inputs, fingerprint } = engine.boundaryRequest(id);
          if (engine.hasBoundaryResult(fingerprint)) {
            this.boundaryStatuses[id] = "ok";
            continue;
          }
          this.boundaryStatuses[id] = "pending";
          let promise = inflight.get(fingerprint);
          if (!promise) {
            promise = postJSON(BOUNDARY_URLS[binding], inputs, { fetchImpl })
              .then((response) => engine.applyBoundaryResult(fingerprint, flattenResponse(response)))
              .finally(() => inflight.delete(fingerprint));
            inflight.set(fingerprint, promise);
          }
          await promise;
          this.boundaryStatuses[id] = "ok";
        }
        if (token !== solveToken) return;
      this.boundaryError = null;
      this.closeDraft();
      this.maltDrawer = null;
      this.maltActiveIndex = null;
      this.sugarDrawer = null;
      } catch (error) {
        if (token !== solveToken) return;
        this.boundaryError = error;
        for (const id of boundaryNodes) {
          if (this.boundaryStatuses[id] === "pending") this.boundaryStatuses[id] = "error";
        }
      }
      this.compute();
    },

    // Debounced entry point for edits: coalesce bursts, supersede in-flight
    // solves. Offline (stubs) computes synchronously.
    scheduleSolve() {
      if (!useHttp) {
        this.compute();
        return;
      }
      solveToken++;
      if (solveTimer) clearTimeout(solveTimer);
      solveTimer = setTimeout(() => this.solveNow(), debounceMs);
    },

    compute() {
      // Boundary-derived values may be unresolved (pending/failed solve); a
      // failed resolution must not blank the whole card, so those paths yield
      // no state rather than throwing.
      const safe = (fn) => {
        try {
          return fn();
        } catch {
          return [];
        }
      };
      const fieldDomains = safe(() => engine.fieldDomainStates());
      const fieldDomainIndex = {};
      for (const d of fieldDomains) fieldDomainIndex[`${d.selectionNodeId}.${d.field}`] = d;

      const collectionDomains = safe(() => engine.collectionDomainStates());
      const collectionIndex = {};
      for (const d of collectionDomains) {
        (collectionIndex[d.nodeId] ??= {});
        (collectionIndex[d.nodeId][d.index] ??= {});
        collectionIndex[d.nodeId][d.index][d.field] = d;
      }

      const all = produce(artifact, steps, registry, engine, {
        references: cache.references,
        ui,
        fieldDomains: fieldDomainIndex,
        collectionDomains: collectionIndex,
      });
      this.fieldsBySlice = Object.fromEntries(
        steps.map((s) => [s.slice, all.filter((f) => f.slice === s.slice)])
      );
      this.relations = safe(() => engine.relationStates());
      this.domains = safe(() => engine.domainStates());
      this.fieldDomains = fieldDomains;
      this.collectionDomains = collectionDomains;
      refreshYeastCard(this, cardCtx);
      refreshStyleCard(this, cardCtx);
      this.violationCount =
        this.relations.filter((r) => !r.holds).length +
        this.domains.filter((d) => !d.holds).length +
        fieldDomains.filter((d) => !d.holds).length +
        collectionDomains.filter((d) => !d.holds).length;

      this.stepStatus = {};
      for (const step of steps) this.stepStatus[step.slice] = { relations: [], domains: [] };
      for (const r of this.relations) {
        if (r.holds) continue;
        for (const slice of relationSlices(relationDefs[r.id]?.predicate)) {
          this.stepStatus[slice]?.relations.push(r);
        }
      }
      for (const d of this.domains) {
        if (d.holds) continue;
        this.stepStatus[d.nodeId.split(".")[0]]?.domains.push(d);
      }
      for (const d of fieldDomains) {
        if (d.holds) continue;
        const slice =
          fieldSlice.get(`${d.selectionNodeId}.${d.field}`) ?? selectionSlice.get(d.selectionNodeId);
        this.stepStatus[slice]?.domains.push(d);
      }
      for (const d of collectionDomains) {
        if (d.holds) continue;
        this.stepStatus[fieldSlice.get(d.nodeId)]?.domains.push(d);
      }
      // Refresh the card readouts (reactive).
      refreshMaltCard(this, cardCtx);
      refreshTraceMaltsCard(this, cardCtx);
      refreshHopCard(this, cardCtx);
      refreshLateAdditionsCard(this, cardCtx);
      refreshMashCard(this, cardCtx);
    },

    // Re-merge user-authored items into the cache/engine and re-render. Called
    // by the catalog CRUD surface after a mutation. Every selection is
    // invalidated (a user item may be referenced by any of them) so the memoized
    // valuation re-resolves against the updated overlay; `catalogRevision` is the
    // reactive signal the picker getters depend on.
    refreshUserItems() {
      cache.syncUserItems(userCatalog.catalogs);
      for (const [id, node] of Object.entries(artifact.nodes)) {
        if (node.kind === "selection") engine.invalidate(id);
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

    syncNav() {
      this.activeIndex = ui.activeIndex;
      this.highwater = ui.highwater;
      this.activeStep = steps[ui.activeIndex];
      this.visibleSteps = steps
        .slice(0, ui.highwater + 1)
        .map((s, i) => ({ ...s, index: i, active: i === ui.activeIndex, complete: i < ui.activeIndex }));
    },

    selectStep(index) {
      if (index < 0 || index > ui.highwater) return;
      ui.activeIndex = index;
      this.syncNav();
    },

    next() {
      const index = Math.min(ui.activeIndex + 1, steps.length - 1);
      if (index === ui.activeIndex) return;
      this.navDir = "next";
      ui.activeIndex = index;
      ui.highwater = Math.max(ui.highwater, ui.activeIndex);
      this.syncNav();
    },

    prev() {
      const index = Math.max(ui.activeIndex - 1, 0);
      if (index === ui.activeIndex) return;
      this.navDir = "prev";
      ui.activeIndex = index;
      this.syncNav();
    },

    // Keyboard mirror of the up/down rail (arrows + page up/down). Ignored while
    // focus is in a form control so it doesn't hijack arrow keys.
    keyNav(direction, event) {
      const el = event?.target;
      if (el?.closest?.("input, select, textarea")) return;
      if (direction === "prev") this.prev();
      else this.next();
    },

    setUnit(dimension, unit) {
      if (unit) ui.unitMode[dimension] = unit;
      else delete ui.unitMode[dimension];
      this.unitMode = { ...ui.unitMode };
      saveUnitMode(ui.unitMode, artifact.schema_version);
      this.compute();
    },

    // Clear every stored unit preference (master picks + per-field overrides,
    // including invisible ones on summary readouts) and revert to defaults.
    resetUnits() {
      ui.unitMode = clearUnitMode();
      this.unitMode = { ...ui.unitMode };
      this.compute();
    },

    // Per-field unit override: cycle the field through its dimension's units,
    // dropping the override when it lands back on the field's inherited unit
    // (the pinned registry `displayUnit`, else the master menu pick, else base).
    toggleFieldUnit(field) {
      const dim = field.dimension;
      if (!dim) return;
      const dimDef = UNIT_DIMENSIONS.find((d) => d.id === dim);
      if (!dimDef) return;
      const units = dimDef.units.map(([id]) => id);
      const fieldDefault = field.displayUnit ?? ui.unitMode[dim] ?? dimDef.default ?? units[0];
      const current = ui.unitMode[field.id] ?? fieldDefault;
      const next = units[(units.indexOf(current) + 1) % units.length];
      if (next === fieldDefault) delete ui.unitMode[field.id];
      else ui.unitMode[field.id] = next;
      this.unitMode = { ...ui.unitMode };
      saveUnitMode(ui.unitMode, artifact.schema_version);
      this.compute();
    },

    toggleUnits() {
      this.unitsOpen = !this.unitsOpen;
    },

    // Clamp an editable value to the envelope of its selected component, when
    // one applies (a batch root bounded by a selection's fields). Returns the
    // clamped value; an unset optional selection contributes no bounds.
    clampToSelection(nodeId, value) {
      if (typeof value !== "number") return value;
      let low;
      let high;
      if (nodeId === "batch.hlt_starting_volume_l") {
        low = engine.resolve("equipment.hlt_coil_floor_l");
        high = engine.resolve("equipment.max_hlt_volume_l");
      } else {
        return value;
      }
      if (typeof low === "number" && value < low) value = low;
      if (typeof high === "number" && value > high) value = high;
      return value;
    },

    edit(field, value) {
      if (!field.editable || !field.target) return;
      let raw = field.control === "number" ? Number(value) : value;
      // The input renders in the field's display unit (dimension default or
      // per-field override); convert the typed value back to the base unit
      // before it reaches the engine.
      if (field.control === "number" && field.dimension && field.unitId && value !== "") {
        raw = toBase(artifact, field.dimension, field.unitId, Number(value), nonlinearFns(artifact, engine));
      }
      // Store the raw value live (no envelope clamp here): clamping on every
      // keystroke fights the user mid-typing, so it is deferred to commitField
      // on blur. The report-only relations still flag out-of-range values.
      this.setRoot(field.target.nodeId, raw);
      if (field.target.nodeId === "batch.topology") this.resetIntensiveValue(raw);
      if (field.target.scope === "root" && raw) this.copyInCascade(field.target.nodeId);
      this.scheduleSolve();
      this.notify();
    },

    // Clamp an envelope-bounded number field to its selected component's range
    // when the field is committed (blur/change). Live `edit` stores raw so typing
    // isn't fought; this enforces the envelope only when the value is final.
    commitField(field) {
      if (!field.editable || !field.target || field.control !== "number") return;
      const current = this.master.getRoot(field.target.nodeId);
      if (typeof current !== "number") return;
      const clamped = this.clampToSelection(field.target.nodeId, current);
      if (clamped !== current) {
        this.setRoot(field.target.nodeId, clamped);
        this.scheduleSolve();
        this.notify();
      }
    },

    // Restore a seed-derived root to its source value (the "↺" affordance shown
    // once the user has overridden it).
    resetField(field) {
      const nodeId = field?.target?.nodeId;
      if (!nodeId || field.seededValue === undefined) return;
      this.setRoot(nodeId, field.seededValue);
      this.scheduleSolve();
      this.notify();
    },

    // Switching topology reinterprets the intensive value (L/kg vs dimensionless
    // r), so reset it to the topology's sensible default (mirrors the legacy
    // onTopologyChange).
    resetIntensiveValue(topology) {
      const constant =
        topology === "runoff_ratio" ? "default_runoff_ratio" : "default_mash_thickness_l_per_kg";
      const value = artifact.constants[constant]?.value;
      if (typeof value === "number") this.setRoot("batch.intensive_value", value);
    },

    // Selection -> root copy-in (view-only). Picking a source report / target
    // profile pre-fills the editable ion roots; they remain user-editable.
    copyInCascade(refRootId) {
      const selectionNode = refToSelectionMap.get(refRootId);
      if (!selectionNode) return;
      const component = engine.get(selectionNode);
      if (!component) return;
      for (const { rootId, derive } of derivationsFor(selectionNode)) {
        const value = derive(component);
        if (typeof value === "number" || (typeof value === "string" && value !== "")) {
          this.setRoot(rootId, value);
        }
      }
    },

    runAction(action) {
      this[action.handler]?.();
    },

    editCell(field, rowIndex, columnId, value) {
      const column = field.columns.find((c) => c.id === columnId);
      // Convert a display-unit cell back to the base unit before storing; a
      // dimensioned cell with no display unit still stores a real number (not
      // the input's string).
      let raw = value;
      if (value !== "" && column?.dimension) {
        const n = Number(value);
        raw = column.displayUnit ? toBase(artifact, column.dimension, column.displayUnit, n) : n;
      }
      const rows = (engine.get(field.target.nodeId) ?? []).map((row, i) =>
        i === rowIndex ? { ...row, [columnId]: raw } : { ...row }
      );
      // Formulation rule (TODO/L3): `parts` is the grist authoring column; `pct`
      // (and thus the grain-bill `w_i`) is the normalized allocation that sums to
      // exactly 100% at 0.1% resolution. Boil hops use the same parts -> pct rule
      // over their IBU pool.
      let next = rows;
      if (columnId === "parts") {
        if (field.target.nodeId === "grist.major_malts") next = this.normalizeGrist(rows);
        else if (field.target.nodeId === "batch.boil_hops") next = this.normalizeHopRows(rows);
      }
      engine.setCollection(field.target.nodeId, next);
      this.scheduleSolve();
      this.notify();
    },

    addRow(field) {
      const node = artifact.nodes[field.target.nodeId];
      const schema = artifact.primitive_schemas[node.item_schema] ?? {};
      // Seed a row with type-appropriate defaults (numbers, first taxonomy
      // member, schema default) rather than empty strings, so a new row is
      // well-formed and doesn't POST a request that fails validation.
      const defaults = {};
      for (const [key, spec] of Object.entries(schema)) {
        if (spec.default !== undefined) defaults[key] = spec.default;
        else if (spec.type === "boolean") defaults[key] = false;
        else if (spec.taxonomy) defaults[key] = artifact.taxonomies[spec.taxonomy]?.[0] ?? "";
        else if (spec.dimension) defaults[key] = 0;
        else defaults[key] = "";
      }
      engine.setCollection(field.target.nodeId, [...(engine.get(field.target.nodeId) ?? []), defaults]);
      this.scheduleSolve();
      this.notify();
    },

    removeRow(field, rowIndex) {
      const rows = (engine.get(field.target.nodeId) ?? []).filter((_, i) => i !== rowIndex);
      let next = rows;
      if (field.target.nodeId === "grist.major_malts") next = this.normalizeGrist(rows);
      else if (field.target.nodeId === "batch.boil_hops") next = this.normalizeHopRows(rows);
      engine.setCollection(field.target.nodeId, next);
      this.scheduleSolve();
      this.notify();
    },

    // Hamilton-normalize the grain bill's `pct` (fractions summing to 1) from its
    // `parts`.
    normalizeGrist(rows) {
      if (!rows.length) return rows;
      const pcts = hamiltonPct(rows.map((row) => row.parts));
      return rows.map((row, i) => ({ ...row, pct: pcts[i] }));
    },

    // Hamilton-normalize the boil-hop IBU shares (`pct`) from their `parts`.
    normalizeHopRows(rows) {
      if (!rows.length) return rows;
      const pcts = hamiltonPct(rows.map((row) => row.parts));
      return rows.map((row, i) => ({ ...row, pct: pcts[i] }));
    },

    // Dispatch a collection-table's add-row action: a bespoke handler named by
    // the manifest, else the generic blank-row add.
    runCollectionAdd(field) {
      const handler = field.addAction && this[field.addAction];
      if (typeof handler === "function") handler.call(this);
      else this.addRow(field);
    },

    // --- Collection draft editors (uniform: scratch copy + unit-aware grid) ---
    // Every collection editor edits a deep-copied draft, never the engine: edits
    // don't touch the engine/solvers/persistence until Save (Cancel discards, or
    // restores nothing since the engine was untouched). The grid formats draft
    // values through the SAME unit resolution as the producer, via the shared
    // `resolveCollectionColumns` + `displayValue` helpers.

    draftOpen: false,
    draftNodeId: "",
    draftRows: [],

    draftEntry() {
      for (const step of steps) {
        for (const entry of step.fields) {
          if (entry && typeof entry === "object" && entry.collection === this.draftNodeId) return entry;
        }
      }
      return {};
    },

    get draftColumns() {
      if (!this.draftNodeId) return [];
      return resolveCollectionColumns(artifact, registry, this.draftNodeId, this.draftEntry(), ui.unitMode);
    },

    // Draft total (mass-unit aware) for the modal header / totals row. Sums
    // `pick(row)` over the draft and formats it in the mass column's display
    // unit (used by the late-additions and trace-malt editors).
    draftMassDisplay(pick) {
      const col = this.draftColumns.find((c) => c.id === "mass_kg");
      const total = (this.draftRows ?? []).reduce((sum, r) => sum + (pick(r) || 0), 0);
      if (!col) return String(total);
      const v = displayValue(artifact, "mass", col.displayUnit, total, nonlinearFns(artifact, engine));
      const shown = col.decimals != null ? v.toFixed(col.decimals) : Math.round(v * 1000) / 1000;
      return `${shown}${col.unit ? " " + col.unit : ""}`;
    },

    // Draft rows converted to their display units (mirrors the producer field).
    get draftDisplayRows() {
      const columns = this.draftColumns;
      const nl = nonlinearFns(artifact, engine);
      return this.draftRows.map((row) => {
        const out = { ...row };
        for (const col of columns) {
          let v = row[col.id];
          if (col.displayUnit && col.dimension && typeof v === "number") {
            v = displayValue(artifact, col.dimension, col.displayUnit, v, nl);
          }
          if (typeof v === "number") {
            v = col.decimals != null ? v.toFixed(col.decimals) : Math.round(v * 1000) / 1000;
          }
          out[col.id] = v;
        }
        return out;
      });
    },

    openDraft(nodeId) {
      this.draftNodeId = nodeId;
      this.draftRows = JSON.parse(JSON.stringify(engine.get(nodeId) ?? []));
      this.normalizeDraft();
      this.draftOpen = true;
    },

    closeDraft() {
      this.draftOpen = false;
      this.draftRows = [];
      this.draftNodeId = "";
    },

    saveDraft() {
      engine.setCollection(this.draftNodeId, JSON.parse(JSON.stringify(this.normalizeDraft())));
      this.closeDraft();
      this.scheduleSolve();
      this.notify();
    },

    // Hamilton-normalize a draft's pct from its parts (grist or boil hops).
    // Mutates rows in place (stable references) and returns them.
    normalizeDraft() {
      if (
        (this.draftNodeId === "grist.major_malts" || this.draftNodeId === "batch.boil_hops") &&
        this.draftRows.length
      ) {
        const pcts = hamiltonPct(this.draftRows.map((r) => r.parts));
        this.draftRows.forEach((r, i) => {
          r.pct = pcts[i];
        });
      }
      return this.draftRows;
    },

    // Edit a draft cell: the input carries a display value; store its base.
    editDraftCell(ri, colId, value) {
      const col = this.draftColumns.find((c) => c.id === colId);
      if (!col) return;
      let base = value;
      if (value !== "" && col.dimension) {
        const n = Number(value);
        base = col.displayUnit
          ? toBase(artifact, col.dimension, col.displayUnit, n, nonlinearFns(artifact, engine))
          : n;
      }
      this.draftRows[ri][colId] = base;
      this.normalizeDraft();
    },

    addDraftRow(row) {
      this.draftRows.push(row);
      this.normalizeDraft();
    },

    removeDraftRow(ri) {
      this.draftRows.splice(ri, 1);
      this.normalizeDraft();
    },

    patchDraftRow(ri, patch) {
      Object.assign(this.draftRows[ri], patch);
    },

    // Inspector field edits (shared by the draft cards). `scale` converts a
    // display input to base (percent inputs use 0.01). Empty clears the field.
    setMaltField(ri, field, value, scale = 1) {
      if (value === "") {
        this.patchDraftRow(ri, { [field]: undefined });
        return;
      }
      const n = Number(value);
      this.patchDraftRow(ri, { [field]: Number.isFinite(n) ? n * scale : 0 });
    },

    // Color (grain_color) edits in the master unit (Lovibond/EBC) and stores base
    // (Lovibond). The malt/trace inspectors bind to these instead of the raw
    // color_lovibond value, mirroring the collection grids' unit handling.
    colorUnit() {
      const unitId = this.unitMode.grain_color ?? "EBC";
      return UNIT_SYMBOLS.grain_color?.[unitId] ?? unitId;
    },

    colorDisplay(value) {
      if (typeof value !== "number" || !Number.isFinite(value)) return "";
      const unitId = this.unitMode.grain_color ?? "EBC";
      return Math.round(displayValue(artifact, "grain_color", unitId, value) * 10) / 10;
    },

    setColorField(ri, value) {
      if (value === "") {
        this.patchDraftRow(ri, { color_lovibond: undefined });
        return;
      }
      const unitId = this.unitMode.grain_color ?? "EBC";
      const n = Number(value);
      this.patchDraftRow(ri, {
        color_lovibond: Number.isFinite(n) ? toBase(artifact, "grain_color", unitId, n) : 0,
      });
    },

    // Explicit boot (main.js owns it after auth). Deliberately NOT named
    // `init`: Alpine auto-calls an `init()` method on `x-data` objects, which
    // would run a solve before sign-in (and 401).
    async boot() {
      if (useHttp) await this.solveNow();
      else this.compute();
      this.syncNav();
    },

    // Reset to the pristine auth-scoped baseline (sign-out). Bumps the solve
    // token so any in-flight boundary response is discarded, rebuilds the engine
    // from the seed cache, and returns the UI to the first step. Unit prefs are
    // device-local and deliberately preserved.
    teardown() {
      solveToken++;
      if (solveTimer) {
        clearTimeout(solveTimer);
        solveTimer = null;
      }
      inflight.clear();
      master.replaceRoots(baselineRoots);
      collections = { ...cache.collections };
      engine = createCalculator(artifact, {
        references: cache.references,
        collections,
        boundaries: useHttp ? {} : STUB_BOUNDARIES,
        boundaryRequests: BOUNDARY_BUILDERS,
        roots: master.allRoots(),
      });
      this.boundaryStatuses = Object.fromEntries(
        boundaryNodes.map((id) => [id, useHttp ? "pending" : "ok"])
      );
      this.boundaryError = null;
      ui.activeIndex = 0;
      ui.highwater = 0;
      this.syncNav();
      this.compute();
    },
  };

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
      if (node.kind === "selection") engine.invalidate(id);
    }
  };
  return app;
}
