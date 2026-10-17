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
import { clearUnitMode, loadUnitMode, saveUnitMode } from "../store/unitPrefs.js";
import { produce, nonlinearFns, resolveCollectionColumns, displayValue } from "../views/producer.js";
import {
  styleCentroid,
  feasibleVertices,
  polygonCentroid,
  pointInRegion,
  edgeMargin,
  chebyshevCenter,
  targetFromExtract,
  extractFromTarget,
  limitHeadroom,
  oeSliceAt,
  aeSliceAt,
} from "../engine/fermentation.js";
import { hamiltonPct } from "../views/hamilton.js";
import { registerHopCard, refreshHopCard } from "./cards/hops.js";
import * as mash from "../views/mash.js";
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

// Cap the rendered yeast rows (the catalog is large); the full count is still
// shown in the result counter.
const MAX_VISIBLE_YEASTS = 25;

// Grain bill: cap major malts (matches the legacy builder) and a client-only
// key for draft rows (so the editor can track rows before they're persisted).
const MAX_MAJOR_MALTS = 8;
const MAX_VISIBLE_MALTS = 25;
const MAX_VISIBLE_STYLES = 25;

// fraction (0..1) -> percentage string with up to one decimal (0.744 -> "74.4").
const formatPercent = (f) => (typeof f === "number" ? String(Math.round(f * 1000) / 10) : "");

const normalizeTag = (t) => (t ?? "").trim().toLowerCase().replace(/\s+/g, "-");

function styleTagSet(style) {
  return new Set((style?.tags ?? "").split(",").map(normalizeTag));
}

function styleFermentation(style) {
  const tags = styleTagSet(style);
  const name = (style?.name ?? "").toLowerCase();
  if (tags.has("bottom-fermented")) return "lager";
  if (tags.has("wild-fermented") || tags.has("wild-fermentation")) return "wild";
  if (name.includes("mixed-fermentation")) return "mixed";
  return "ale";
}

function styleStrength(style) {
  const tags = styleTagSet(style);
  if (tags.has("session-strength")) return "session";
  if (tags.has("standard-strength")) return "standard";
  if (tags.has("high-strength")) return "high";
  if (tags.has("very-high-strength")) return "very high";
  return "";
}

function styleColor(style) {
  const tags = styleTagSet(style);
  if (tags.has("pale-color")) return "pale";
  if (tags.has("amber-color")) return "amber";
  if (tags.has("dark-color")) return "dark";
  return "";
}

// Bin apparent attenuation (fraction 0..1) into the four commercial tiers.
// Gaps between the tabulated ranges are split at their half-points so every
// strain lands in exactly one tier.
function yeastAttenuationTier(pct) {
  if (typeof pct !== "number") return "";
  const p = pct * 100;
  if (p < 70.5) return "low";
  if (p < 75.5) return "medium";
  if (p < 82.5) return "high";
  return "super";
}

// Summary-card order: largest parts first, then name (case-insensitive) as a
// stable tie-break. Display-only; the draft editor keeps its own row order.
function sortGristRows(rows) {
  return [...rows].sort(
    (a, b) =>
      (Number(b.parts) || 0) - (Number(a.parts) || 0) ||
      String(a.name ?? "").localeCompare(String(b.name ?? ""), undefined, { sensitivity: "base" })
  );
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

  // Shared context for the per-card modules (cards/<name>.js). Cards attach
  // reactive state/handlers onto `app` before main.js wraps it in Alpine.reactive.
  const cardCtx = { engine, cache, ui, artifact };

  const app = {
    master,
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
    fieldsBySlice: {},
    selectedYeastId: "",
    selectedStyleId: "",
    styleSource: "styleguide",
    styleRegion: [],
    styleEnvelope: null,
    styleSafestPoint: null,
    styleExtract: null,
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
      this.selectedYeastId = engine.get("batch.yeast_id") || "";
      this.selectedStyleId = engine.get("batch.style_id") || "";
      this.styleSource = engine.get("batch.style_source") || "styleguide";
      this.computeStyleTarget();
      this.refreshTargets();
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
      // Refresh the grain-bill rows for the summary card (reactive).
      this.gristRows = sortGristRows(engine.get("grist.major_malts") ?? []);
      this.traceMaltRows = engine.get("grist.trace_malts") ?? [];
      refreshHopCard(this, cardCtx);
      this.sugarList = engine.get("batch.sugars") ?? [];
      this.mashRests = engine.get("mash.rests") ?? [];
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
    yeastAttenuationFilter: "",

    get yeastCatalog() {
      return Object.values(cache.references.yeast ?? {});
    },

    get yeastManufacturers() {
      return [...new Set(this.yeastCatalog.map((y) => y.manufacturer).filter(Boolean))].sort();
    },

    get yeastAttenuationTiers() {
      return [
        { key: "low", label: "Low 65–70%" },
        { key: "medium", label: "Medium 71–75%" },
        { key: "high", label: "High 76–82%" },
        { key: "super", label: "Super 83%+" },
      ];
    },

    get filteredYeasts() {
      const q = this.yeastSearchQuery.trim().toLowerCase();
      const m = this.yeastManufacturerFilter;
      const t = this.yeastAttenuationFilter;
      return this.yeastCatalog.filter(
        (y) =>
          (!q || y.name.toLowerCase().includes(q)) &&
          (!m || y.manufacturer === m) &&
          (!t || yeastAttenuationTier(y.attenuation_pct) === t)
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

    yeastAttenuation(y) {
      return y ? `${formatPercent(y.attenuation_pct)}%` : "";
    },

    get selectedYeastTemp() {
      const y = this.selectedYeast;
      if (!y || typeof y.temp_low_c !== "number" || typeof y.temp_high_c !== "number") return "";
      return `${y.temp_low_c}–${y.temp_high_c}°C`;
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

    // --- Style selection card (bespoke) ---
    styleSearchQuery: "",
    styleCategoryFilter: "",
    styleStrengthFilter: "",
    styleColorFilter: "",
    styleFermentationFilter: "",

    get styleCatalog() {
      return Object.values(cache.references.style ?? {});
    },

    get styleCategories() {
      return [...new Set(this.styleCatalog.map((s) => s.category_name).filter(Boolean))].sort();
    },

    get styleStrengths() {
      return ["session", "standard", "high", "very high"];
    },

    get styleColors() {
      return ["pale", "amber", "dark"];
    },

    get styleFermentations() {
      return ["ale", "lager", "wild", "mixed"];
    },

    get filteredStyles() {
      const q = this.styleSearchQuery.trim().toLowerCase();
      const cat = this.styleCategoryFilter;
      const strength = this.styleStrengthFilter;
      const color = this.styleColorFilter;
      const ferm = this.styleFermentationFilter;
      return this.styleCatalog.filter((s) => {
        const haystack = `${s.name ?? ""} ${s.id ?? ""} ${s.category_name ?? ""} ${s.tags ?? ""}`.toLowerCase();
        if (q && !haystack.includes(q)) return false;
        if (cat && s.category_name !== cat) return false;
        if (strength && styleStrength(s) !== strength) return false;
        if (color && styleColor(s) !== color) return false;
        if (ferm && styleFermentation(s) !== ferm) return false;
        return true;
      });
    },

    get visibleStyles() {
      return this.filteredStyles.slice(0, MAX_VISIBLE_STYLES);
    },

    get styleResultCount() {
      return this.filteredStyles.length;
    },

    get isStyleListTruncated() {
      return this.styleResultCount > MAX_VISIBLE_STYLES;
    },

    get selectedStyle() {
      return this.selectedStyleId ? cache.references.style[this.selectedStyleId] ?? null : null;
    },

    get selectedStyleTarget() {
      const s = this.selectedStyle;
      if (!s) return null;
      return styleCentroid(s);
    },

    styleRangeText(s) {
      if (!s || s.og_min === undefined) return "";
      return `${s.og_min}–${s.og_max} / ${s.fg_min}–${s.fg_max}`;
    },

    styleGravity(s, field) {
      const v = s?.[field];
      return typeof v === "number" ? v.toFixed(3) : "";
    },

    selectStyle(id) {
      this.setRoot("batch.style_id", id);
      const style = cache.references.style[id];
      if (style) {
        for (const field of ["og_min", "og_max", "fg_min", "fg_max", "ibu_min", "ibu_max", "srm_min", "srm_max", "abv_min", "abv_max"]) {
          const value = style[field];
          if (typeof value === "number") this.setRoot(`batch.style_${field}`, value);
        }
        this.setRoot("batch.fermentation", styleFermentation(style));
        const centroid = styleCentroid(style);
        if (centroid) {
          this.setRoot("batch.apparent_attenuation", centroid.aa);
          this.setRoot("batch.target_abv", centroid.abv);
        }
        // Seed the color/bitterness targets at the envelope midpoint so the
        // sliders start inside the style's range.
        if (typeof style.srm_min === "number" && typeof style.srm_max === "number") {
          this.setRoot("batch.target_srm", (style.srm_min + style.srm_max) / 2);
        }
        if (typeof style.ibu_min === "number" && typeof style.ibu_max === "number") {
          this.setRoot("batch.target_ibu", (style.ibu_min + style.ibu_max) / 2);
        }
      }
      this.refreshTargets();
      this.scheduleSolve();
      this.notify();
    },

    clearStyleSelection() {
      this.setRoot("batch.style_id", "");
      this.setRoot("batch.fermentation", "ale");
      this.scheduleSolve();
      this.notify();
    },

    styleField(id) {
      return (this.fieldsBySlice.style ?? []).find((f) => f.id === id) ?? {};
    },

    // --- Style target picker (OE/AE region navigator, bespoke) ---
    // The batch AA / target-ABV roots are the source of truth; the picker's
    // slider positions are their inverse. The region comes from the envelope
    // (batch.style_* roots) so it tracks envelope edits (WYSIWYG).
    computeStyleTarget() {
      const envelope = {
        ogMin: engine.get("batch.style_og_min"),
        ogMax: engine.get("batch.style_og_max"),
        fgMin: engine.get("batch.style_fg_min"),
        fgMax: engine.get("batch.style_fg_max"),
        abvMin: engine.get("batch.style_abv_min"),
        abvMax: engine.get("batch.style_abv_max"),
      };
      const complete =
        envelope.ogMin < envelope.ogMax &&
        envelope.fgMin < envelope.fgMax &&
        envelope.abvMin < envelope.abvMax;
      this.styleEnvelope = complete ? envelope : null;
      this.styleRegion = complete ? feasibleVertices(envelope) : [];
      this.styleSafestPoint = this.styleRegion.length >= 3 ? chebyshevCenter(this.styleRegion) : null;
      this.styleExtract = null;
      if (this.styleRegion.length < 3) return;
      const aa = engine.get("batch.apparent_attenuation");
      const abv = engine.get("batch.target_abv");
      const inverse =
        typeof aa === "number" && typeof abv === "number" ? extractFromTarget(aa, abv) : null;
      if (
        inverse &&
        (pointInRegion(this.styleRegion, inverse.oe, inverse.ae) ||
          edgeMargin(this.styleRegion, inverse.oe, inverse.ae) < 1e-6)
      ) {
        this.styleExtract = inverse;
      } else {
        const centroid = polygonCentroid(this.styleRegion);
        if (centroid) this.styleExtract = { oe: centroid[0], ae: centroid[1] };
      }
    },

    get styleOeBounds() {
      if (!this.styleExtract) return null;
      return oeSliceAt(this.styleRegion, this.styleExtract.ae);
    },

    get styleAeBounds() {
      if (!this.styleExtract) return null;
      return aeSliceAt(this.styleRegion, this.styleExtract.oe);
    },

    get styleTargetInfo() {
      if (!this.styleExtract) return null;
      return targetFromExtract(this.styleExtract.oe, this.styleExtract.ae);
    },

    get styleTargetRisk() {
      if (!this.styleExtract || !this.styleSafestPoint) return null;
      const margin = edgeMargin(this.styleRegion, this.styleExtract.oe, this.styleExtract.ae);
      const radius = this.styleSafestPoint.radius;
      const safety = radius > 0 ? Math.max(0, Math.min(1, margin / radius)) : null;
      const nearest = limitHeadroom(this.styleEnvelope, this.styleExtract.oe, this.styleExtract.ae);
      return { safety, nearest };
    },

    // SVG geometry for the preview: the region polygon plus the marker/safest
    // points, in pixel space (no viewBox — an SVG `viewBox` binding is defeated
    // by HTML attribute lowercasing). The region is drawn at its true aspect
    // ratio, its longer side spanning REGION_PX, with PAD_PX around it; the
    // shorter side (and the vertical slider) is clamped to MIN_PX.
    get stylePreview() {
      const region = this.styleRegion;
      if (region.length < 3 || !this.styleExtract || !this.styleSafestPoint) return null;
      const xs = region.map(([x]) => x);
      const ys = region.map(([, y]) => y);
      const xMin = Math.min(...xs);
      const xMax = Math.max(...xs);
      const yMin = Math.min(...ys);
      const yMax = Math.max(...ys);
      const spanX = xMax - xMin || 1;
      const spanY = yMax - yMin || 1;
      const REGION_PX = 220;
      const PAD_PX = 16;
      const MIN_PX = 64;
      const scale = REGION_PX / Math.max(spanX, spanY);
      const regionW = spanX * scale;
      const regionH = spanY * scale;
      const width = Math.max(regionW + 2 * PAD_PX, MIN_PX);
      const height = Math.max(regionH + 2 * PAD_PX, MIN_PX);
      const xOffset = (width - regionW) / 2;
      const yOffset = (height - regionH) / 2;
      const sx = (x) => xOffset + (x - xMin) * scale;
      const sy = (y) => height - yOffset - (y - yMin) * scale;
      return {
        width,
        height,
        polygon: region.map(([x, y]) => `${sx(x).toFixed(1)},${sy(y).toFixed(1)}`).join(" "),
        marker: { x: sx(this.styleExtract.oe).toFixed(1), y: sy(this.styleExtract.ae).toFixed(1) },
        safest: {
          x: sx(this.styleSafestPoint.oe).toFixed(1),
          y: sy(this.styleSafestPoint.ae).toFixed(1),
        },
      };
    },

    applyStyleExtract(oe, ae) {
      const target = targetFromExtract(oe, ae);
      this.setRoot("batch.apparent_attenuation", target.aa);
      this.setRoot("batch.target_abv", target.abv);
      this.scheduleSolve();
      this.notify();
    },

    setStyleTargetOe(value) {
      if (!this.styleExtract) return;
      const bounds = oeSliceAt(this.styleRegion, this.styleExtract.ae);
      if (!bounds) return;
      const oe = Math.max(bounds[0], Math.min(bounds[1], Number(value)));
      this.applyStyleExtract(oe, this.styleExtract.ae);
    },

    setStyleTargetAe(value) {
      if (!this.styleExtract) return;
      const bounds = aeSliceAt(this.styleRegion, this.styleExtract.oe);
      if (!bounds) return;
      const ae = Math.max(bounds[0], Math.min(bounds[1], Number(value)));
      this.applyStyleExtract(this.styleExtract.oe, ae);
    },

    resetStyleTarget() {
      const centroid = this.styleRegion.length >= 3 ? polygonCentroid(this.styleRegion) : null;
      if (centroid) this.applyStyleExtract(centroid[0], centroid[1]);
    },

    // --- SRM / IBU / boil-whirlpool target sliders (envelope-bounded) ---
    get styleSrmBounds() {
      const min = Number(this.styleField("batch.style_srm_min").value);
      const max = Number(this.styleField("batch.style_srm_max").value);
      return Number.isFinite(min) && Number.isFinite(max) && min < max ? [min, max] : null;
    },

    get styleIbuBounds() {
      const min = Number(this.styleField("batch.style_ibu_min").value);
      const max = Number(this.styleField("batch.style_ibu_max").value);
      return Number.isFinite(min) && Number.isFinite(max) && min < max ? [min, max] : null;
    },

    // Reactive mirrors of the target roots (refreshed in compute() and setters).
    targetSrm: 0,
    targetIbu: 30,
    whirlpoolFraction: 0,
    boilIbu: 30,
    whirlpoolIbu: 0,
    ibuGu: null,

    refreshTargets() {
      this.targetSrm = engine.get("batch.target_srm");
      this.targetIbu = engine.get("batch.target_ibu");
      this.whirlpoolFraction = engine.get("batch.whirlpool_ibu_fraction");
      this.boilIbu = engine.get("batch.boil_target_ibu");
      this.whirlpoolIbu = engine.get("batch.whirlpool_target_ibu");

      // IBU/GU balance: target IBU over gravity units of the computed post-boil OG.
      let postBoilSg = null;
      try {
        postBoilSg = engine.resolve("solver.batch.sg_post_boil");
      } catch {
        postBoilSg = null;
      }
      const gu = typeof postBoilSg === "number" ? (postBoilSg - 1) * 1000 : null;
      this.ibuGu =
        gu && gu > 0 && typeof this.targetIbu === "number" ? this.targetIbu / gu : null;
    },

    get ibuGuDisplay() {
      return typeof this.ibuGu === "number" ? this.ibuGu.toFixed(2) : "—";
    },

    get whirlpoolPctDisplay() {
      const fraction = this.whirlpoolFraction;
      return typeof fraction === "number" ? Math.round(fraction * 100) : 0;
    },

    get boilIbuDisplay() {
      const ibu = this.boilIbu;
      return typeof ibu === "number" ? ibu.toFixed(1) : "—";
    },

    get whirlpoolIbuDisplay() {
      const ibu = this.whirlpoolIbu;
      return typeof ibu === "number" ? ibu.toFixed(1) : "—";
    },

    setTargetSrm(value) {
      const n = Number(value);
      if (!Number.isFinite(n)) return;
      this.setRoot("batch.target_srm", Math.max(0, n));
      this.refreshTargets();
      this.scheduleSolve();
      this.notify();
    },

    setTargetIbu(value) {
      const n = Number(value);
      if (!Number.isFinite(n)) return;
      this.setRoot("batch.target_ibu", Math.max(0, n));
      this.refreshTargets();
      this.scheduleSolve();
      this.notify();
    },

    setWhirlpoolFraction(value) {
      const n = Number(value);
      if (!Number.isFinite(n)) return;
      this.setRoot("batch.whirlpool_ibu_fraction", Math.max(0, Math.min(1, n)));
      this.refreshTargets();
      this.scheduleSolve();
      this.notify();
    },

    // --- Mash profile card (bespoke) ---
    // Rests collection rows in base units, refreshed in compute(); the partial
    // and modal bind to these plus the scalar field models in fieldsBySlice.mash.
    mashRests: [],

    mashModalOpen: false,
    mashDraft: [],
    mashDraftDirty: false,

    get mashPresetLabels() {
      return mash.MASH_PRESET_LABELS;
    },

    get mashPresetId() {
      return engine.get("mash.preset_id");
    },

    get canonicalMashRests() {
      const byId = new Map(this.mashRests.map((r) => [r.rest_id, r]));
      return [mash.DOUGH_IN_REST, ...mash.CANONICAL_RESTS, mash.MASH_OUT_REST].map((def) => {
        const row = byId.get(def.rest_id);
        const isBookend =
          def.rest_id === mash.DOUGH_IN_REST.rest_id || def.rest_id === mash.MASH_OUT_REST.rest_id;
        return {
          ...def,
          enabled: row ? !!row.enabled : isBookend,
          use_temp_c: row ? row.use_temp_c : null,
          duration_min: row ? row.duration_min : null,
        };
      });
    },

    get sortedMashRests() {
      return mash.sortRestsByTemperature(this.mashRests);
    },

    get enabledMashRests() {
      return this.sortedMashRests.filter((r) => r.enabled);
    },

    get hasOptionalRestsEnabled() {
      return mash.hasOptionalRests(this.enabledMashRests);
    },

    get doughInInheritedTempC() {
      return engine.get("mash.dough_in_target_temp_c");
    },

    get temperatureUnit() {
      const unitId = ui.unitMode.temperature ?? "degC";
      return UNIT_SYMBOLS.temperature[unitId] ?? unitId;
    },

    get doughInDisplay() {
      const v = this.doughInInheritedTempC;
      if (v == null) return "";
      const d = this._convert("temperature", v, "degC");
      return Number.isFinite(d) ? d.toFixed(1) : "";
    },

    get totalMashTimeMin() {
      return mash.totalMashDurationMin(this.enabledMashRests);
    },

    get limitOfAttenuation() {
      return mash.estimateLimitOfAttenuation(this.mashRests);
    },

    // Display conversion (base -> display) routed through the producer's
    // `displayValue` so unit conversion stays single-sourced (guard A8a).
    _convert(dimension, value, fallbackUnit) {
      if (value == null) return null;
      const unitId = ui.unitMode[dimension] ?? fallbackUnit ?? null;
      return displayValue(artifact, dimension, unitId, value, nonlinearFns(artifact, engine));
    },

    restUseTempDisplay(rest) {
      if (!rest || rest.use_temp_c == null) return "";
      const v = this._convert("temperature", rest.use_temp_c, "degC");
      return Number.isFinite(v) ? v.toFixed(1) : "";
    },

    restTempRangeDisplay(restId) {
      const def = mash.getCanonicalRest(restId);
      if (!def || def.temp_min_c == null || def.temp_max_c == null) return "";
      const min = this._convert("temperature", def.temp_min_c, "degC");
      const max = this._convert("temperature", def.temp_max_c, "degC");
      return `${Math.round(min)}–${Math.round(max)}`;
    },

    restBoundDisplay(restId, bound) {
      const def = mash.getCanonicalRest(restId);
      if (!def) return "";
      const base = bound === "min" ? def.temp_min_c : def.temp_max_c;
      if (base == null) return "";
      return Math.round(this._convert("temperature", base, "degC"));
    },

    limitOfAttenuationDisplay() {
      if (this.limitOfAttenuation == null || isNaN(this.limitOfAttenuation)) return "";
      const v = this._convert("percentage", this.limitOfAttenuation, "pct");
      return Number.isFinite(v) ? v.toFixed(1) : "";
    },

    getRestDefinition(restId) {
      return mash.getCanonicalRest(restId);
    },

    restName(restId) {
      const def = mash.getCanonicalRest(restId);
      return def ? def.name : restId;
    },

    restPurpose(restId) {
      const def = mash.getCanonicalRest(restId);
      return def ? def.purpose : "";
    },

    isRestOutOfRange(restId, useTempC) {
      const rest = mash.getCanonicalRest(restId);
      if (!rest || rest.temp_min_c == null || rest.temp_max_c == null) return false;
      if (typeof useTempC !== "number" || isNaN(useTempC)) return false;
      return useTempC < rest.temp_min_c || useTempC > rest.temp_max_c;
    },

    // Field-model accessor for the metric strip (reuses producer display/write).
    mashField(id) {
      return (this.fieldsBySlice.mash ?? []).find((f) => f.id === id) ?? {};
    },

    // Strike temp is derived from the dough-in target; with no enabled rest it
    // is undefined/NaN, so render "—" rather than a stale/NaN readout.
    strikeWaterTempDisplay() {
      const f = this.mashField("mash.strike_water_temp_c");
      if (!f || typeof f.value !== "number" || !Number.isFinite(f.value)) return "";
      return f.display;
    },

    _materializeRests(rows) {
      const byId = new Map(rows.map((r) => [r.rest_id, r]));
      const order = [
        mash.DOUGH_IN_REST.rest_id,
        ...mash.CANONICAL_RESTS.map((r) => r.rest_id),
        mash.MASH_OUT_REST.rest_id,
      ];
      return order.map((id) => {
        const existing = byId.get(id);
        if (existing) return { ...existing };
        const isBookend = id === mash.DOUGH_IN_REST.rest_id || id === mash.MASH_OUT_REST.rest_id;
        return { rest_id: id, enabled: isBookend, use_temp_c: null, duration_min: null };
      });
    },

    _writeMashRests(rows) {
      engine.setCollection("mash.rests", rows);
      this.scheduleSolve();
      this.notify();
    },

    onMashPresetChange(presetId) {
      this.setRoot("mash.preset_id", presetId);
      this._writeMashRests(mash.applyMashPreset(this._materializeRests(this.mashRests), presetId));
    },

    toggleMashRest(restId, enabled) {
      this.setRoot("mash.preset_id", "custom");
      const def = mash.getCanonicalRest(restId);
      const rows = this._materializeRests(this.mashRests).map((r) => {
        if (r.rest_id !== restId) return r;
        const shouldEnable = !!enabled;
        return {
          ...r,
          enabled: shouldEnable,
          use_temp_c:
            shouldEnable && r.use_temp_c == null && def && def.temp_min_c != null
              ? (def.temp_min_c + def.temp_max_c) / 2
              : r.use_temp_c,
        };
      });
      this._writeMashRests(rows);
    },

    // Configure Rests modal (draft/cancel): edits land in a scratch copy and
    // are committed on OK; Cancel discards.
    openMashModal() {
      this.mashDraft = JSON.parse(JSON.stringify(this._materializeRests(this.mashRests)));
      this.mashDraftDirty = false;
      this.mashModalOpen = true;
    },

    closeMashModal() {
      this.mashModalOpen = false;
      this.mashDraft = [];
      this.mashDraftDirty = false;
    },

    commitMashSchedule() {
      if (this.mashDraftDirty) this.setRoot("mash.preset_id", "custom");
      this._writeMashRests(JSON.parse(JSON.stringify(this.mashDraft)));
      this.closeMashModal();
    },

    get sortedMashDraftRests() {
      return mash.sortRestsByTemperature(this.mashDraft).filter((r) => r.enabled);
    },

    get mashDraftDoughInTempC() {
      let result;
      for (const r of this.sortedMashDraftRests) {
        if (r.rest_id === "dough_in") continue;
        if (typeof r.use_temp_c !== "number" || isNaN(r.use_temp_c)) continue;
        if (result === undefined || r.use_temp_c < result) result = r.use_temp_c;
      }
      return result;
    },

    get mashDraftDoughInDisplay() {
      const v = this.mashDraftDoughInTempC;
      if (v == null) return "";
      const d = this._convert("temperature", v, "degC");
      return Number.isFinite(d) ? d.toFixed(1) : "";
    },

    get isMashDraftValid() {
      return mash.isMashScheduleValid(this.sortedMashDraftRests, this.mashDraftDoughInTempC);
    },

    mashDraftRow(restId) {
      return this.mashDraft.find((r) => r.rest_id === restId) ?? null;
    },

    setMashDraftTemp(restId, displayVal) {
      const row = this.mashDraftRow(restId);
      if (!row) return;
      row.use_temp_c =
        displayVal === ""
          ? null
          : toBase(artifact, "temperature", ui.unitMode.temperature ?? "degC", Number(displayVal));
      if (row.use_temp_c != null && Number.isNaN(row.use_temp_c)) row.use_temp_c = null;
      this.mashDraftDirty = true;
    },

    setMashDraftDuration(restId, displayVal) {
      const row = this.mashDraftRow(restId);
      if (!row) return;
      if (displayVal === "") {
        row.duration_min = null;
      } else {
        const n = Number(displayVal);
        row.duration_min = Number.isNaN(n) ? null : n;
      }
      this.mashDraftDirty = true;
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

    // Grain-bill rows for the summary card (reactive; refreshed in compute()).
    gristRows: [],

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

    // --- Grain bill editor ---
    maltDrawer: null, // "search" | "inspect" | null
    maltActiveIndex: null,
    maltSearch: "",
    maltCategoryFilter: [],

    get maltEditorOpen() {
      return this.draftOpen && this.draftNodeId === "grist.major_malts";
    },

    // Weighted grist readouts come from the producer's field models (master-aware,
    // display-only).
    get maltWeightedColor() {
      return (this.fieldsBySlice.fermentables ?? []).find((f) => f.id === "grist.weighted_lovibond") ?? null;
    },

    get maltWeightedYield() {
      return (this.fieldsBySlice.fermentables ?? []).find((f) => f.id === "grist.weighted_yield_fraction") ?? null;
    },

    get maltCatalog() {
      return Object.values(cache.seeds.malts ?? {});
    },

    get maltCategories() {
      return artifact.taxonomies.malt_category ?? [];
    },

    get maltCatalogCategories() {
      const seen = new Set();
      for (const m of this.maltCatalog) if (m.category) seen.add(m.category);
      return [...seen].sort();
    },

    get maltFilteredCatalog() {
      const active = new Set(this.draftRows.map((r) => r.catalog_id).filter(Boolean));
      const q = this.maltSearch.trim().toLowerCase();
      const cats = this.maltCategoryFilter;
      return this.maltCatalog.filter(
        (m) =>
          !active.has(m.id) &&
          (cats.length === 0 || cats.includes(m.category)) &&
          (!q || (m.name ?? "").toLowerCase().includes(q) || (m.notes ?? "").toLowerCase().includes(q))
      );
    },

    get maltVisibleCatalog() {
      return this.maltFilteredCatalog.slice(0, MAX_VISIBLE_MALTS);
    },

    get maltCatalogTruncated() {
      return this.maltFilteredCatalog.length > MAX_VISIBLE_MALTS;
    },

    get maltTotalParts() {
      return this.draftRows.reduce((sum, r) => sum + (Number(r.parts) || 0), 0);
    },

    get maltTotalPct() {
      return this.draftRows.reduce((sum, r) => sum + (r.pct || 0), 0);
    },

    get maltValidation() {
      const total = Number((this.maltTotalPct * 100).toFixed(1));
      if (total === 100) return { type: "balanced", label: "100.0% Balanced", class: "badge-success" };
      if (total === 0) return { type: "unconfigured", label: "Unconfigured", class: "badge-muted" };
      if (total < 100) {
        const remaining = (100 - total).toFixed(1);
        return { type: "deficit", label: `${total.toFixed(1)}% (Remaining ${remaining}%)`, class: "badge-amber" };
      }
      const excess = (total - 100).toFixed(1);
      return { type: "surplus", label: `${total.toFixed(1)}% (Excess +${excess}%)`, class: "badge-danger" };
    },

    get maltAtLimit() {
      return this.draftRows.length >= MAX_MAJOR_MALTS;
    },

    get maltActiveRow() {
      return this.maltActiveIndex == null ? null : this.draftRows[this.maltActiveIndex] ?? null;
    },

    // Trace = under 2% of the bill (matches the legacy threshold).
    maltIsTrace(row) {
      return (row.pct || 0) < 0.02;
    },

    openMaltEditor() {
      this.openDraft("grist.major_malts");
      this.maltDrawer = null;
      this.maltActiveIndex = null;
    },

    cancelMaltEditor() {
      this.closeDraft();
      this.maltDrawer = null;
      this.maltActiveIndex = null;
    },

    saveMaltEditor() {
      this.saveDraft();
      this.maltDrawer = null;
      this.maltActiveIndex = null;
    },

    addCatalogMalt(catalogId) {
      const malt = cache.seeds.malts?.[catalogId];
      if (!malt || this.maltAtLimit) return;
      this.addDraftRow({
        catalog_id: malt.id,
        name: malt.name,
        category: malt.category,
        parts: 10,
        pct: 0,
        yield_fraction: malt.yield_fraction,
        color_lovibond: malt.color_lovibond,
        moisture_pct: malt.moisture_pct ?? 0.04,
        di_ph: malt.di_ph,
        buffer_index: malt.buffer_index,
        notes: malt.notes,
      });
    },

    removeDraftMalt(ri) {
      this.removeDraftRow(ri);
      if (this.maltActiveIndex === ri) {
        this.maltActiveIndex = null;
        if (this.maltDrawer === "inspect") this.maltDrawer = null;
      } else if (this.maltActiveIndex != null && this.maltActiveIndex > ri) {
        this.maltActiveIndex -= 1;
      }
    },

    cloneDraftMalt(ri) {
      if (this.maltAtLimit) return;
      const row = this.draftRows[ri];
      if (!row) return;
      this.addDraftRow({ ...row, catalog_id: null, name: `${row.name} (Custom)` });
      this.inspectDraftRow(this.draftRows.length - 1);
    },

    inspectDraftRow(ri) {
      this.maltActiveIndex = ri;
      this.maltDrawer = "inspect";
    },

    // Inspector field edits. `scale` converts a display input to base (percent
    // inputs use 0.01). Empty clears the field.
    setMaltField(ri, field, value, scale = 1) {
      if (value === "") {
        this.patchDraftRow(ri, { [field]: undefined });
        return;
      }
      const n = Number(value);
      this.patchDraftRow(ri, { [field]: Number.isFinite(n) ? n * scale : 0 });
    },

    openMaltSearch() {
      this.maltDrawer = "search";
      this.maltActiveIndex = null;
      this.maltSearch = "";
      this.maltCategoryFilter = [];
    },

    closeMaltDrawer() {
      this.maltDrawer = null;
      this.maltActiveIndex = null;
    },

    toggleMaltCategory(category) {
      this.maltCategoryFilter = this.maltCategoryFilter.includes(category)
        ? this.maltCategoryFilter.filter((c) => c !== category)
        : [...this.maltCategoryFilter, category];
    },

    handleMaltEscape() {
      if (!this.maltEditorOpen) return;
      if (this.maltDrawer !== null) this.closeMaltDrawer();
      else this.cancelMaltEditor();
    },

    // --- Late additions editor (same draft model) ---
    sugarDrawer: null, // "search" | null
    sugarSearch: "",

    // Sugar rows for the summary card (reactive; refreshed in compute()).
    sugarList: [],

    get sugarEditorOpen() {
      return this.draftOpen && this.draftNodeId === "batch.sugars";
    },

    sugarField(id) {
      return (this.fieldsBySlice["late-additions"] ?? []).find((f) => f.id === id) ?? null;
    },

    // The engine-backed sugar collection field (for the read-only summary card).
    get lateSugarField() {
      return (
        (this.fieldsBySlice["late-additions"] ?? []).find((f) => f.control === "collection-table") ?? null
      );
    },

    get sugarMassField() {
      return this.sugarField("grist.sugars_mass");
    },

    get sugarColorField() {
      return this.sugarField("grist.sugar_weighted_lovibond");
    },

    get lateExtractField() {
      return this.sugarField("batch.s_late_add");
    },

    get sugarCatalog() {
      return Object.values(cache.seeds.sugars ?? {});
    },

    get sugarFilteredCatalog() {
      const active = new Set(this.draftRows.map((r) => r.sugar_id).filter(Boolean));
      const q = this.sugarSearch.trim().toLowerCase();
      return this.sugarCatalog.filter(
        (s) =>
          !active.has(s.id) &&
          (!q || (s.name ?? "").toLowerCase().includes(q) || (s.notes ?? "").toLowerCase().includes(q))
      );
    },

    get sugarVisibleCatalog() {
      return this.sugarFilteredCatalog.slice(0, MAX_VISIBLE_MALTS);
    },

    get sugarCatalogTruncated() {
      return this.sugarFilteredCatalog.length > MAX_VISIBLE_MALTS;
    },

    // Draft totals (mass-unit aware) for the modal header / totals row.
    _sugarDraftTotal(pick) {
      const col = this.draftColumns.find((c) => c.id === "mass_kg");
      const total = this.draftRows.reduce((sum, r) => sum + pick(r), 0);
      if (!col) return String(total);
      const v = displayValue(artifact, "mass", col.displayUnit, total, nonlinearFns(artifact, engine));
      const shown = col.decimals != null ? v.toFixed(col.decimals) : Math.round(v * 1000) / 1000;
      return `${shown}${col.unit ? " " + col.unit : ""}`;
    },

    get sugarDraftMassDisplay() {
      return this._sugarDraftTotal((r) => Number(r.mass_kg) || 0);
    },

    get sugarDraftExtractDisplay() {
      return this._sugarDraftTotal((r) => (Number(r.mass_kg) || 0) * (Number(r.yield_fraction) || 0));
    },

    openSugarEditor() {
      this.openDraft("batch.sugars");
      this.sugarDrawer = null;
    },

    cancelSugarEditor() {
      this.closeDraft();
      this.sugarDrawer = null;
    },

    saveSugarEditor() {
      this.saveDraft();
      this.sugarDrawer = null;
    },

    addCatalogSugar(catalogId) {
      const sugar = cache.seeds.sugars?.[catalogId];
      if (!sugar) return;
      this.addDraftRow({
        sugar_id: sugar.id,
        name: sugar.name,
        mass_kg: 0,
        yield_fraction: sugar.yield_fraction,
        color_lovibond: sugar.color_lovibond,
        notes: sugar.notes,
      });
      this.closeSugarDrawer();
    },

    openSugarSearch() {
      this.sugarDrawer = "search";
      this.sugarSearch = "";
    },

    closeSugarDrawer() {
      this.sugarDrawer = null;
    },

    handleSugarEscape() {
      if (this.sugarDrawer !== null) this.closeSugarDrawer();
      else this.cancelSugarEditor();
    },

    // --- Trace malts editor (definite mass; same draft model, malt catalog) ---
    traceDrawer: null, // "search" | "inspect" | null
    traceSearch: "",
    traceActiveIndex: null,
    traceMaltCategoryFilter: [],

    // Trace rows for the summary card (reactive; refreshed in compute()).
    traceMaltRows: [],

    get traceEditorOpen() {
      return this.draftOpen && this.draftNodeId === "grist.trace_malts";
    },

    traceField(id) {
      return (this.fieldsBySlice.fermentables ?? []).find((f) => f.id === id) ?? null;
    },

    get traceMaltField() {
      return this.traceField("grist.trace_malts");
    },

    get traceMassField() {
      return this.traceField("grist.trace_malts_mass");
    },

    get traceColorField() {
      return this.traceField("grist.trace_weighted_lovibond");
    },

    get traceCatalog() {
      return Object.values(cache.seeds.malts ?? {});
    },

    get traceCategories() {
      return this.maltCatalogCategories;
    },

    get traceFilteredCatalog() {
      const active = new Set(this.draftRows.map((r) => r.catalog_id).filter(Boolean));
      const q = this.traceSearch.trim().toLowerCase();
      const cats = this.traceMaltCategoryFilter;
      return this.traceCatalog.filter(
        (m) =>
          !active.has(m.id) &&
          (cats.length === 0 || cats.includes(m.category)) &&
          (!q || (m.name ?? "").toLowerCase().includes(q) || (m.notes ?? "").toLowerCase().includes(q))
      );
    },

    get traceVisibleCatalog() {
      return this.traceFilteredCatalog.slice(0, MAX_VISIBLE_MALTS);
    },

    get traceCatalogTruncated() {
      return this.traceFilteredCatalog.length > MAX_VISIBLE_MALTS;
    },

    get traceActiveRow() {
      return this.traceActiveIndex == null ? null : this.draftRows[this.traceActiveIndex] ?? null;
    },

    get traceDraftMassDisplay() {
      return this._sugarDraftTotal((r) => Number(r.mass_kg) || 0);
    },

    openTraceEditor() {
      this.openDraft("grist.trace_malts");
      this.traceDrawer = null;
      this.traceActiveIndex = null;
    },

    cancelTraceEditor() {
      this.closeDraft();
      this.traceDrawer = null;
      this.traceActiveIndex = null;
    },

    saveTraceEditor() {
      this.saveDraft();
      this.traceDrawer = null;
      this.traceActiveIndex = null;
    },

    addCatalogTraceMalt(catalogId) {
      const malt = cache.seeds.malts?.[catalogId];
      if (!malt) return;
      this.addDraftRow({
        catalog_id: malt.id,
        name: malt.name,
        category: malt.category,
        mass_kg: 0,
        yield_fraction: malt.yield_fraction,
        color_lovibond: malt.color_lovibond,
        moisture_pct: malt.moisture_pct ?? 0.04,
        di_ph: malt.di_ph,
        buffer_index: malt.buffer_index,
        notes: malt.notes,
      });
      this.closeTraceDrawer();
    },

    removeTraceMalt(ri) {
      this.removeDraftRow(ri);
      if (this.traceActiveIndex === ri) {
        this.traceActiveIndex = null;
        if (this.traceDrawer === "inspect") this.traceDrawer = null;
      } else if (this.traceActiveIndex != null && this.traceActiveIndex > ri) {
        this.traceActiveIndex -= 1;
      }
    },

    inspectTraceRow(ri) {
      this.traceActiveIndex = ri;
      this.traceDrawer = "inspect";
    },

    openTraceSearch() {
      this.traceDrawer = "search";
      this.traceActiveIndex = null;
      this.traceSearch = "";
      this.traceMaltCategoryFilter = [];
    },

    closeTraceDrawer() {
      this.traceDrawer = null;
      this.traceActiveIndex = null;
    },

    toggleTraceCategory(category) {
      this.traceMaltCategoryFilter = this.traceMaltCategoryFilter.includes(category)
        ? this.traceMaltCategoryFilter.filter((c) => c !== category)
        : [...this.traceMaltCategoryFilter, category];
    },

    handleTraceEscape() {
      if (!this.traceEditorOpen) return;
      if (this.traceDrawer !== null) this.closeTraceDrawer();
      else this.cancelTraceEditor();
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

  registerHopCard(app, cardCtx);
  return app;
}
