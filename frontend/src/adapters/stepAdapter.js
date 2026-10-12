// Step-view adapter: binds Alpine to the field-model producer. The view binds to
// field models; ONLY this adapter + the producer touch the engine. Boundary stubs
// are the default offline seam (HTTP is Step D's path).
import artifact from "../engine/artifact.json" with { type: "json" };
import { createCalculator } from "../engine/index.js";
import { createReferenceCache } from "../store/referenceCache.js";
import { createAppStore } from "../store/index.js";
import { produce } from "../views/producer.js";
import { registry, steps } from "../views/steps.js";
import { UNIT_DIMENSIONS } from "../views/registry/units.js";
import { STUB_BOUNDARIES } from "./stubBoundaries.js";

// Collect the slice prefixes referenced by a relation predicate (a tree of
// {ref}/{op}/{args}/{lhs}/{rhs}/{const} nodes). Used to surface violations on the
// cards that own the relevant nodes.
function refSlices(node, out = new Set()) {
  if (node === null || typeof node !== "object") return out;
  if ("ref" in node) out.add(node.ref.split(".")[0]);
  if (Array.isArray(node)) {
    for (const item of node) refSlices(item, out);
  } else {
    for (const value of Object.values(node)) refSlices(value, out);
  }
  return out;
}

export function createStepApp() {
  const { master, ui } = createAppStore();
  const cache = createReferenceCache();
  const collections = { ...cache.collections };
  const overlays = {};
  const engine = createCalculator(artifact, {
    references: cache.references,
    collections,
    overlays,
    boundaries: STUB_BOUNDARIES,
    roots: master.allRoots(),
  });

  const relationDefs = Object.fromEntries((artifact.relations ?? []).map((r) => [r.id, r]));

  const app = {
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
    modal: ui.modal,
    fieldsBySlice: {},
    relations: [],
    domains: [],

    setRoot(nodeId, value) {
      master.setRoot(nodeId, value);
      engine.setRoot(nodeId, value);
    },

    compute() {
      const all = produce(artifact, steps, registry, engine, {
        references: cache.references,
        ui,
      });
      app.fieldsBySlice = Object.fromEntries(
        steps.map((s) => [s.slice, all.filter((f) => f.slice === s.slice)])
      );
      app.relations = engine.relationStates();
      app.domains = engine.domainStates();
      app.violationCount =
        app.relations.filter((r) => !r.holds).length + app.domains.filter((d) => !d.holds).length;

      app.stepStatus = {};
      for (const step of steps) app.stepStatus[step.slice] = { relations: [], domains: [] };
      for (const r of app.relations) {
        if (r.holds) continue;
        for (const slice of refSlices(relationDefs[r.id]?.predicate)) {
          app.stepStatus[slice]?.relations.push(r);
        }
      }
      for (const d of app.domains) {
        if (d.holds) continue;
        app.stepStatus[d.nodeId.split(".")[0]]?.domains.push(d);
      }
    },

    syncNav() {
      app.activeIndex = ui.activeIndex;
      app.highwater = ui.highwater;
      app.activeStep = steps[ui.activeIndex];
      app.visibleSteps = steps
        .slice(0, ui.highwater + 1)
        .map((s, i) => ({ ...s, index: i, active: i === ui.activeIndex, complete: i < ui.activeIndex }));
    },

    selectStep(index) {
      if (index < 0 || index > ui.highwater) return;
      ui.activeIndex = index;
      app.syncNav();
    },

    next() {
      ui.activeIndex = Math.min(ui.activeIndex + 1, steps.length - 1);
      ui.highwater = Math.max(ui.highwater, ui.activeIndex);
      app.syncNav();
    },

    prev() {
      ui.activeIndex = Math.max(ui.activeIndex - 1, 0);
      app.syncNav();
    },

    setUnit(dimension, unit) {
      if (unit) ui.unitMode[dimension] = unit;
      else delete ui.unitMode[dimension];
      app.unitMode = { ...ui.unitMode };
      app.compute();
    },

    toggleUnits() {
      app.unitsOpen = !app.unitsOpen;
    },

    openModal(name) {
      ui.modal = name;
      app.modal = name;
    },

    closeModal() {
      ui.modal = null;
      app.modal = null;
    },

    edit(field, value) {
      if (!field.editable || !field.target) return;
      const raw = field.control === "number" ? Number(value) : value;
      if (field.target.scope === "overlay") {
        engine.setOverlay(field.target.selectionNodeId, field.target.field, raw);
      } else {
        app.setRoot(field.target.nodeId, raw);
      }
      if (field.target.scope === "root" && raw) app.copyInCascade(field.target.nodeId);
      app.compute();
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
          if (typeof report[src] === "number") app.setRoot(`water.source.${dst}`, report[src]);
        }
      } else if (rootId === "water.target_profile_id") {
        const profile = engine.resolve("water.target_profile");
        if (!profile) return;
        for (const ion of ["calcium_ca", "magnesium_mg", "sodium_na", "sulfate_so4", "chloride_cl", "alkalinity_as_caco3"]) {
          if (typeof profile[ion] === "number") app.setRoot(`water.target.${ion}`, profile[ion]);
        }
      }
    },

    useYeastAttenuation() {
      const attenuation = engine.resolve("batch.yeast.attenuation_pct");
      if (typeof attenuation === "number") {
        app.setRoot("batch.apparent_attenuation", attenuation);
        app.compute();
      }
    },

    runAction(action) {
      const handler = app[action.handler];
      if (typeof handler === "function") handler();
    },

    clearOverlay(field) {
      if (field.target?.scope === "overlay") {
        engine.clearOverlay(field.target.selectionNodeId, field.target.field);
        app.compute();
      }
    },

    editCell(field, rowIndex, columnId, value) {
      const rows = (engine.get(field.target.nodeId) ?? []).map((row, i) =>
        i === rowIndex ? { ...row, [columnId]: value } : row
      );
      engine.setCollection(field.target.nodeId, rows);
      app.compute();
    },

    addRow(field) {
      const node = artifact.nodes[field.target.nodeId];
      const schema = artifact.primitive_schemas[node.item_schema] ?? {};
      const blank = Object.fromEntries(Object.keys(schema).map((k) => [k, ""]));
      engine.setCollection(field.target.nodeId, [...(engine.get(field.target.nodeId) ?? []), blank]);
      app.compute();
    },

    removeRow(field, rowIndex) {
      const rows = (engine.get(field.target.nodeId) ?? []).filter((_, i) => i !== rowIndex);
      engine.setCollection(field.target.nodeId, rows);
      app.compute();
    },

    init() {
      app.compute();
      app.syncNav();
    },
  };

  return app;
}
