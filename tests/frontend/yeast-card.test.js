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
    attenuation_cap_pct: 0.85,
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

test("a legacy snapshot reads its old attenuation_pct as the cap", () => {
  const app = cardFor({ id: "deleted-record", attenuation_pct: 0.78 });

  assert.equal(app.selectedYeast.attenuation_cap_pct, 0.78);
  assert.equal(app.selectedYeastPublished, "78%");
});

test("a stale ranged snapshot takes the published high as its cap", () => {
  const app = cardFor({
    id: "deleted-record",
    attenuation_low_pct: 0.82,
    attenuation_high_pct: 0.92,
    attenuation_cap_pct: 0.85,
  });

  assert.equal(app.selectedYeast.attenuation_cap_pct, 0.92);
  assert.equal(app.attenuationRangeValid, true);
});

test("a ranged strain exposes the range control and writes the derate", () => {
  const app = cardFor({
    id: "deleted-record",
    attenuation_low_pct: 0.8,
    attenuation_high_pct: 0.86,
    attenuation_cap_pct: 0.86,
    sta1: true,
  });
  app.fieldsById = { "batch.yeast_cap": { value: 0.86 } };
  app.setRoot = (id, value) => {
    app.written = { id, value };
  };
  app.scheduleSolve = () => {};
  app.notify = () => {};

  assert.equal(app.attenuationRangeValid, true);
  app.openAttenuationEditor();
  assert.equal(app.attenuationEditorOpen, true);
  app.setAttenuationDraft(82);
  app.useAttenuationDraft();

  assert.equal(app.written.id, "batch.attenuation_derate_points");
  assert.ok(Math.abs(app.written.value - 0.04) < 1e-9);
  assert.equal(app.attenuationEditorOpen, false);
});

test("a point-only strain has no range control", () => {
  const app = cardFor({
    id: "deleted-record",
    attenuation_cap_pct: 0.78,
  });

  assert.equal(app.attenuationRange, null);
  assert.equal(app.attenuationRangeValid, false);
});

test("the above-cap cause names diastaticus and sugar separately", () => {
  const app = cardFor({
    id: "deleted-record",
    attenuation_cap_pct: 0.8,
    sta1: true,
  });
  app.fieldsById = {
    "batch.yeast_cap": { value: 0.8 },
    "batch.attenuation_above_cap": { value: 0.05 },
    "batch.sugar_extract_total": { value: 0 },
  };

  assert.equal(app.attenuationAboveCapLabel, "+5.0 pts");
  assert.equal(app.attenuationAboveCapCause, "diastaticus");
  assert.equal(app.attenuationBinding, "diastaticus");

  app.fieldsById["batch.sugar_extract_total"] = { value: 0.3 };
  assert.equal(app.attenuationAboveCapCause, "diastaticus + sugar");
  assert.equal(app.attenuationBinding, "diastaticus + sugar");
});

test("the binding constraint is the mash when grist attenuation sits below the cap", () => {
  const app = cardFor({ id: "deleted-record", attenuation_cap_pct: 0.8 });
  app.fieldsById = {
    "batch.yeast_cap": { value: 0.8 },
    "solver.batch.grist_attenuation": { value: 0.72 },
  };

  assert.equal(app.attenuationBinding, "mash-limited");

  app.fieldsById["solver.batch.grist_attenuation"] = { value: 0.8 };
  assert.equal(app.attenuationBinding, "yeast cap");
});
