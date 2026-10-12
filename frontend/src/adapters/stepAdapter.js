// Step-view adapter: binds Alpine to the field-model producer. The view binds to
// field models; ONLY this adapter + the producer touch the engine. Boundary stubs
// are the default offline seam (HTTP is Step D's path).
import artifact from "../engine/artifact.json" with { type: "json" };
import { createCalculator } from "../engine/index.js";
import { createReferenceCache } from "../store/referenceCache.js";
import { createAppStore } from "../store/index.js";
import { produce } from "../views/producer.js";
import { registry, steps } from "../views/steps.js";
import { STUB_BOUNDARIES } from "./stubBoundaries.js";

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

  const app = {
    master,
    step: ui.activeStep,
    unitMode: ui.unitMode,
    modal: ui.modal,
    fieldsBySlice: {},
    relations: [],
    domains: [],

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
    },

    setUnit(dimension, unit) {
      if (unit) ui.unitMode[dimension] = unit;
      else delete ui.unitMode[dimension];
      app.unitMode = { ...ui.unitMode };
      app.compute();
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
        master.setRoot(field.target.nodeId, raw);
        engine.setRoot(field.target.nodeId, raw);
      }
      app.compute();
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

    selectStep(id) {
      ui.activeStep = id;
      app.step = id;
    },

    init() {
      app.compute();
    },
  };

  return app;
}
