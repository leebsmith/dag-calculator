import test from "node:test";
import assert from "node:assert/strict";

import artifact from "../../data/artifact.json" with { type: "json" };
import { createYeastLayers } from "../../frontend/src/adapters/cards/yeast.js";
import { createObservabilityManager } from "../../frontend/src/observability.js";

function cardFor(snapshot) {
  const app = { selectedYeastId: "deleted-record", unitMode: {} };
  const engine = {
    get: (id) => (id === "batch.yeast" ? snapshot : undefined),
    resolve: () => undefined,
    call: () => 0,
  };
  const layers = createYeastLayers({
    cache: { references: { yeast: {} } },
    artifact,
    engine,
    getView: () => app,
    observability: createObservabilityManager(),
  });
  for (const layer of layers) {
    Object.defineProperties(app, Object.getOwnPropertyDescriptors(layer));
  }
  app.selectedYeastId = "deleted-record";
  app.selectedYeastSnapshot = snapshot;
  return app;
}

test("a deleted yeast record displays from the batch selection snapshot", () => {
  const app = cardFor({
    id: "deleted-record",
    name: "Belgian Tripel M31 (copy)",
    attenuation_pct: 0.85,
    sta1: true,
    pof: "positive",
  });

  assert.equal(app.selectedYeast.name, "Belgian Tripel M31 (copy)");
  assert.equal(app.selectedYeastSta1, "STA1+");
  assert.equal(app.selectedYeastPof, "POF+");
});

test("the snapshot fallback leaves an unselected batch empty", () => {
  const app = cardFor(null);
  app.selectedYeastId = "";

  assert.equal(app.selectedYeast, null);
});
