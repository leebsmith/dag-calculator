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
import { createAppStore } from "../store/index.js";
import { loadUnitMode, saveUnitMode } from "../store/unitPrefs.js";
import { produce, nonlinearFns } from "../views/producer.js";
import { hamiltonPct } from "../views/hamilton.js";
import { registry, steps } from "../views/steps.js";
import { UNIT_DIMENSIONS } from "../views/registry/units.js";
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

// Cap the rendered yeast rows (the catalog is large); the full count is still
// shown in the result counter.
const MAX_VISIBLE_YEASTS = 25;

// fraction (0..1) -> percentage string with up to one decimal (0.744 -> "74.4").
const formatPercent = (f) => (typeof f === "number" ? String(Math.round(f * 1000) / 10) : "");

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


export function createStepApp(options = {}) {
  const { master, ui } = createAppStore();
  ui.unitMode = loadUnitMode(artifact);
  const cache = createReferenceCache();
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

  return {
    master,
    steps,
    activeIndex: ui.activeIndex,
    highwater: ui.highwater,
    activeStep: steps[ui.activeIndex],
    visibleSteps: [],
    stepStatus: initialStepStatus,
    unitDimensions: UNIT_DIMENSIONS,
    unitMode: ui.unitMode,
    unitsOpen: false,
    violationCount: 0,
    fieldsBySlice: {},
    selectedYeastId: "",
    relations: [],
    domains: [],
    onChange: null, // optional browser hook, called after each state mutation
    boundaryStatuses: Object.fromEntries(boundaryNodes.map((id) => [id, useHttp ? "pending" : "ok"])),
    boundaryError: null,

    get boundaryPending() {
      return useHttp && boundaryNodes.some((id) => this.boundaryStatuses[id] === "pending");
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
      this.selectedYeastId = engine.get("batch.yeast_id") || "";
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
      ui.activeIndex = Math.min(ui.activeIndex + 1, steps.length - 1);
      ui.highwater = Math.max(ui.highwater, ui.activeIndex);
      this.syncNav();
    },

    prev() {
      ui.activeIndex = Math.max(ui.activeIndex - 1, 0);
      this.syncNav();
    },

    setUnit(dimension, unit) {
      if (unit) ui.unitMode[dimension] = unit;
      else delete ui.unitMode[dimension];
      this.unitMode = { ...ui.unitMode };
      saveUnitMode(ui.unitMode, artifact.schema_version);
      this.compute();
    },

    // Per-field unit override: cycle the field through its dimension's units,
    // dropping the override when it lands back on the field's natural default
    // (dimension default, else the registry's preferred display unit).
    toggleFieldUnit(field) {
      const dim = field.dimension;
      if (!dim) return;
      const dimDef = UNIT_DIMENSIONS.find((d) => d.id === dim);
      if (!dimDef) return;
      const units = dimDef.units.map(([id]) => id);
      const fieldDefault = ui.unitMode[dim] ?? field.displayUnit ?? units[0];
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
      if (nodeId === "batch.apparent_attenuation") {
        low = engine.resolve("batch.yeast.low_attenuation");
        high = engine.resolve("batch.yeast.high_attenuation");
      } else if (nodeId === "batch.hlt_starting_volume_l") {
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
      // A batch value seeded from a selected component is clamped to that
      // component's envelope (e.g. attenuation within the strain's range; the
      // HLT fill within the equipment's [coil floor, capacity]).
      raw = this.clampToSelection(field.target.nodeId, raw);
      this.setRoot(field.target.nodeId, raw);
      if (field.target.scope === "root" && raw) this.copyInCascade(field.target.nodeId);
      this.scheduleSolve();
      this.notify();
    },

    // Selection -> root copy-in (view-only). Picking a source report / target
    // profile pre-fills the editable ion roots; they remain user-editable.
    copyInCascade(rootId) {
      if (rootId === "water.source_report_id") {
        const report = engine.resolve("water.source_report");
        if (!report) return;
        const map = {
          calcium_ca: "calcium_ca",
          magnesium_mg: "magnesium_mg",
          sodium_na: "sodium_na",
          sulfate_so4: "sulfate_so4",
          chloride_cl: "chloride_cl",
          total_alkalinity_caco3: "alkalinity_as_caco3",
        };
        for (const [src, dst] of Object.entries(map)) {
          if (typeof report[src] === "number") this.setRoot(`water.source.${dst}`, report[src]);
        }
      } else if (rootId === "water.target_profile_id") {
        const profile = engine.resolve("water.target_profile");
        if (!profile) return;
        for (const ion of ["calcium_ca", "magnesium_mg", "sodium_na", "sulfate_so4", "chloride_cl", "alkalinity_as_caco3"]) {
          if (typeof profile[ion] === "number") this.setRoot(`water.target.${ion}`, profile[ion]);
        }
      }
    },

    // --- Yeast selection card (bespoke) ---
    yeastSearchQuery: "",
    yeastManufacturerFilter: "",

    get yeastCatalog() {
      return Object.values(cache.references.yeast ?? {});
    },

    get yeastManufacturers() {
      return [...new Set(this.yeastCatalog.map((y) => y.manufacturer).filter(Boolean))].sort();
    },

    get filteredYeasts() {
      const q = this.yeastSearchQuery.trim().toLowerCase();
      const m = this.yeastManufacturerFilter;
      return this.yeastCatalog.filter(
        (y) => (!q || y.name.toLowerCase().includes(q)) && (!m || y.manufacturer === m)
      );
    },

    get visibleYeasts() {
      return this.filteredYeasts.slice(0, MAX_VISIBLE_YEASTS);
    },

    get yeastResultCount() {
      return this.filteredYeasts.length;
    },

    get isYeastListTruncated() {
      return this.yeastResultCount > MAX_VISIBLE_YEASTS;
    },

    get selectedYeast() {
      return this.selectedYeastId ? cache.references.yeast[this.selectedYeastId] ?? null : null;
    },

    yeastAttenuationRange(y) {
      return y ? `${formatPercent(y.low_attenuation)}–${formatPercent(y.high_attenuation)}%` : "";
    },

    // Selecting a strain copies its typical attenuation into the batch's
    // apparent attenuation (which is edited on the Batch Sparge step).
    selectYeast(id) {
      this.setRoot("batch.yeast_id", id);
      const yeast = cache.references.yeast[id];
      if (yeast && typeof yeast.attenuation_pct === "number") {
        this.setRoot("batch.apparent_attenuation", yeast.attenuation_pct);
      }
      this.scheduleSolve();
      this.notify();
    },

    clearYeastSelection() {
      this.setRoot("batch.yeast_id", "");
      this.scheduleSolve();
      this.notify();
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
      // exactly 100% at 0.1% resolution.
      if (field.target.nodeId === "grist.major_malts" && columnId === "parts") {
        const pcts = hamiltonPct(rows.map((row) => row.parts));
        rows.forEach((row, i) => {
          row.pct = pcts[i];
        });
      }
      engine.setCollection(field.target.nodeId, rows);
      this.scheduleSolve();
      this.notify();
    },

    addRow(field) {
      const node = artifact.nodes[field.target.nodeId];
      const schema = artifact.primitive_schemas[node.item_schema] ?? {};
      const blank = Object.fromEntries(Object.keys(schema).map((k) => [k, ""]));
      engine.setCollection(field.target.nodeId, [...(engine.get(field.target.nodeId) ?? []), blank]);
      this.scheduleSolve();
      this.notify();
    },

    removeRow(field, rowIndex) {
      const rows = (engine.get(field.target.nodeId) ?? []).filter((_, i) => i !== rowIndex);
      engine.setCollection(field.target.nodeId, rows);
      this.scheduleSolve();
      this.notify();
    },

    async init() {
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
}
