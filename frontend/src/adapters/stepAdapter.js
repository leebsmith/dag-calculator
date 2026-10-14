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
import { registry, steps } from "../views/steps.js";
import { UNIT_DIMENSIONS } from "../views/registry/units.js";
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
      const id = typeof entry === "string" ? entry : entry.id;
      if (!id) continue;
      const key = fieldKey(id);
      if (key && !map.has(key)) map.set(key, step.slice);
    }
  }
  return map;
}

export function createStepApp() {
  const { master, ui } = createAppStore();
  ui.unitMode = loadUnitMode(artifact);
  const cache = createReferenceCache();
  let collections = { ...cache.collections };
  let engine = createCalculator(artifact, {
    references: cache.references,
    collections,
    boundaries: STUB_BOUNDARIES,
    roots: master.allRoots(),
  });

  const relationDefs = Object.fromEntries((artifact.relations ?? []).map((r) => [r.id, r]));
  const fieldSlice = buildFieldSliceMap();

  // Slices to surface a relation on: map each referenced path through the
  // manifest (so batch.yeast.* lands on the yeast card), falling back to the
  // path's leading segment.
  function relationSlices(predicate) {
    const slices = new Set();
    for (const path of refPaths(predicate)) {
      const slice = fieldSlice.get(fieldKey(path));
      slices.add(slice ?? path.split(".")[0]);
    }
    return slices;
  }

  return {
    master,
    steps,
    activeIndex: ui.activeIndex,
    highwater: ui.highwater,
    activeStep: steps[ui.activeIndex],
    visibleSteps: [],
    stepStatus: {},
    unitDimensions: UNIT_DIMENSIONS,
    unitMode: ui.unitMode,
    unitsOpen: false,
    violationCount: 0,
    fieldsBySlice: {},
    relations: [],
    domains: [],
    onChange: null, // optional browser hook, called after each state mutation

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
    loadState(state) {
      master.replaceRoots(state?.roots ?? {});
      collections = { ...cache.collections, ...(state?.collections ?? {}) };
      engine = createCalculator(artifact, {
        references: cache.references,
        collections,
        boundaries: STUB_BOUNDARIES,
        roots: master.allRoots(),
      });
      this.compute();
      this.syncNav();
    },

    setRoot(nodeId, value) {
      master.setRoot(nodeId, value);
      engine.setRoot(nodeId, value);
    },

    compute() {
      const fieldDomains = engine.fieldDomainStates();
      const fieldDomainIndex = {};
      for (const d of fieldDomains) fieldDomainIndex[`${d.selectionNodeId}.${d.field}`] = d;

      const all = produce(artifact, steps, registry, engine, {
        references: cache.references,
        ui,
        fieldDomains: fieldDomainIndex,
      });
      this.fieldsBySlice = Object.fromEntries(
        steps.map((s) => [s.slice, all.filter((f) => f.slice === s.slice)])
      );
      this.relations = engine.relationStates();
      this.domains = engine.domainStates();
      this.fieldDomains = fieldDomains;
      this.violationCount =
        this.relations.filter((r) => !r.holds).length +
        this.domains.filter((d) => !d.holds).length +
        fieldDomains.filter((d) => !d.holds).length;

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
        this.stepStatus[fieldSlice.get(`${d.selectionNodeId}.${d.field}`)]?.domains.push(d);
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

    edit(field, value) {
      if (!field.editable || !field.target) return;
      let raw = field.control === "number" ? Number(value) : value;
      // The input renders in the field's display unit (dimension default or
      // per-field override); convert the typed value back to the base unit
      // before it reaches the engine.
      if (field.control === "number" && field.dimension && field.unitId && value !== "") {
        raw = toBase(artifact, field.dimension, field.unitId, Number(value), nonlinearFns(artifact, engine));
      }
      // The attenuation a batch uses is bounded by the selected strain's
      // envelope; clamp typed values to it. (An unset yeast resolves to no
      // bounds, so nothing is clamped.)
      if (field.target.nodeId === "batch.apparent_attenuation" && typeof raw === "number") {
        const low = engine.resolve("batch.yeast.low_attenuation");
        const high = engine.resolve("batch.yeast.high_attenuation");
        if (typeof low === "number" && typeof high === "number") {
          if (raw < low) raw = low;
          else if (raw > high) raw = high;
        }
      }
      this.setRoot(field.target.nodeId, raw);
      if (field.target.scope === "root" && raw) this.copyInCascade(field.target.nodeId);
      this.compute();
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

    useYeastAttenuation() {
      const attenuation = engine.resolve("batch.yeast.attenuation_pct");
      if (typeof attenuation === "number") {
        this.setRoot("batch.apparent_attenuation", attenuation);
        this.compute();
        this.notify();
      }
    },

    runAction(action) {
      this[action.handler]?.();
    },

    editCell(field, rowIndex, columnId, value) {
      const column = field.columns.find((c) => c.id === columnId);
      // Convert a display-unit cell back to the base unit before storing.
      let raw = value;
      if (value !== "" && column?.dimension && column?.displayUnit) {
        raw = toBase(artifact, column.dimension, column.displayUnit, Number(value));
      }
      const rows = (engine.get(field.target.nodeId) ?? []).map((row, i) =>
        i === rowIndex ? { ...row, [columnId]: raw } : row
      );
      engine.setCollection(field.target.nodeId, rows);
      this.compute();
      this.notify();
    },

    addRow(field) {
      const node = artifact.nodes[field.target.nodeId];
      const schema = artifact.primitive_schemas[node.item_schema] ?? {};
      const blank = Object.fromEntries(Object.keys(schema).map((k) => [k, ""]));
      engine.setCollection(field.target.nodeId, [...(engine.get(field.target.nodeId) ?? []), blank]);
      this.compute();
      this.notify();
    },

    removeRow(field, rowIndex) {
      const rows = (engine.get(field.target.nodeId) ?? []).filter((_, i) => i !== rowIndex);
      engine.setCollection(field.target.nodeId, rows);
      this.compute();
      this.notify();
    },

    init() {
      this.compute();
      this.syncNav();
    },
  };
}
