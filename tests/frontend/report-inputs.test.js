// Freeze-time report inputs: the validation outcome and per-boundary telemetry
// captured at the moment the report bundle is written. Shape is shared with
// `tests/conformance/fixtures/report-inputs.json` and the Python bundle models.

import test from "node:test";
import assert from "node:assert/strict";

import { createTestApp } from "./appHelpers.js";
import { loadArtifact } from "./helpers.js";
import { artifact as artifactFixture, read } from "../guards/util.js";

const artifact = loadArtifact();
const SHAPE = JSON.parse(read("tests/conformance/fixtures/report-inputs.json"));
const BOUNDARY_IDS = Object.entries(artifact.nodes)
  .filter(([, node]) => node.kind === "boundary")
  .map(([id]) => id);

test("report inputs expose exactly the validation and telemetry blocks", async () => {
  const app = createTestApp();
  await app.boot();
  const inputs = app.reportInputs();

  assert.deepEqual(Object.keys(inputs).sort(), ["telemetry", "validation"]);
  assert.deepEqual(Object.keys(inputs.validation), SHAPE.validation);
  for (const id of Object.keys(inputs.telemetry)) {
    assert.deepEqual(Object.keys(inputs.telemetry[id]), SHAPE.telemetry);
  }
});

test("telemetry is captured for every solved boundary with its applied fingerprint", async () => {
  const app = createTestApp();
  await app.boot();
  const { telemetry } = app.reportInputs();
  const engine = app.engine;

  assert.deepEqual(Object.keys(telemetry).sort(), [...BOUNDARY_IDS].sort());
  for (const id of BOUNDARY_IDS) {
    const entry = telemetry[id];
    assert.equal(entry.binding, artifact.nodes[id].binding);
    assert.equal(entry.fingerprint, engine.get(id).fingerprint);
    assert.notEqual(entry.fingerprint, "");
    assert.ok(Array.isArray(entry.telemetry));
    assert.ok(Array.isArray(entry.warnings));
    assert.ok(Array.isArray(entry.notes));
  }
});

test("the applied fingerprint is not the recomputed request fingerprint", async () => {
  const app = createTestApp();
  await app.boot();
  const engine = app.engine;
  const id = "solver.batch";
  const applied = engine.get(id).fingerprint;

  app.setRoot("batch.v_ferm", 21);
  const recomputed = engine.boundaryRequest(id).fingerprint;
  assert.notEqual(recomputed, applied);

  app.compute();
  assert.equal(app.reportInputs().telemetry[id].fingerprint, engine.get(id).fingerprint);
  assert.notEqual(app.reportInputs().telemetry[id].fingerprint, applied);
});

test("the four validation blocks are present and non-empty for a booted batch", async () => {
  const app = createTestApp();
  await app.boot();
  const { validation } = app.reportInputs();

  assert.ok(validation.relations.length > 0);
  assert.ok(validation.domains.length > 0);
  assert.ok(Array.isArray(validation.field_domains));
  assert.ok(Array.isArray(validation.collection_domains));
  assert.doesNotThrow(() => JSON.stringify(validation));
});

test("the shared shape fixture names declared boundary nodes", () => {
  const declared = new Set(BOUNDARY_IDS);
  for (const id of Object.keys(artifactFixture().nodes)) {
    if (artifactFixture().nodes[id].kind !== "boundary") continue;
    assert.ok(declared.has(id));
  }
});
