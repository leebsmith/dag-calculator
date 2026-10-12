// Step-view adapter: binds Alpine to the field-model producer (Steps A–E-a).
// The view binds to field models; ONLY this adapter + the producer touch the
// engine. Boundary stubs are the default offline seam (HTTP is Step D's path).
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
  const engine = createCalculator(artifact, {
    references: cache.references,
    collections: cache.collections,
    boundaries: STUB_BOUNDARIES,
    roots: master.allRoots(),
  });

  const app = {
    step: ui.activeStep,
    fieldsBySlice: {},
    relations: [],
    domains: [],

    compute() {
      const all = produce(artifact, steps, registry, engine);
      app.fieldsBySlice = Object.fromEntries(
        steps.map((s) => [s.slice, all.filter((f) => f.slice === s.slice)])
      );
      app.relations = engine.relationStates();
      app.domains = engine.domainStates();
    },

    edit(field, value) {
      if (!field.editable || !field.target) return;
      const raw = field.control === "number" ? Number(value) : value;
      master.setRoot(field.target.nodeId, raw);
      engine.setRoot(field.target.nodeId, raw);
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
