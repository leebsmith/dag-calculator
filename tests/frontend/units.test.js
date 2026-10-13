import test from "node:test";
import assert from "node:assert/strict";

import { fromBase, toBase, inferAddDimension, inferSubDimension } from "../../frontend/src/engine/units.js";
import { loadArtifact } from "./helpers.js";

const artifact = loadArtifact();

test("linear conversion: mass lb -> kg -> lb", () => {
  const kg = toBase(artifact, "mass", "lb", 10);
  assert.ok(Math.abs(kg - 4.5359237) < 1e-9);
  assert.ok(Math.abs(fromBase(artifact, "mass", "lb", kg) - 10) < 1e-9);
});

test("linear conversion: percentage pct -> fraction", () => {
  assert.ok(Math.abs(toBase(artifact, "percentage", "pct", 50) - 0.5) < 1e-9);
});

test("affine conversion: temperature degF <-> degC", () => {
  assert.ok(Math.abs(fromBase(artifact, "temperature", "degF", 100) - 212) < 1e-9);
  assert.ok(Math.abs(toBase(artifact, "temperature", "degF", 212) - 100) < 1e-9);
});

test("linear conversion: grain_color Lovibond -> EBC", () => {
  assert.ok(Math.abs(fromBase(artifact, "grain_color", "EBC", 9.2) - 9.2 * 1.97) < 1e-9);
  assert.ok(Math.abs(toBase(artifact, "grain_color", "EBC", 9.2 * 1.97) - 9.2) < 1e-9);
});

test("linear conversion: beer_color SRM -> EBC", () => {
  assert.ok(Math.abs(fromBase(artifact, "beer_color", "EBC", 5) - 5 * 1.97) < 1e-9);
});

test("nonlinear conversion: gravity SG <-> Plato via injected fns", () => {
  const nonlinearFns = { sg_to_plato: (x) => x * 2, plato_to_sg: (x) => x / 2 };
  assert.equal(fromBase(artifact, "gravity", "Plato", 1.05, nonlinearFns), 2.1);
  assert.equal(toBase(artifact, "gravity", "Plato", 2.1, nonlinearFns), 1.05);
});

test("dimension check: temperature + temperature_delta is legal", () => {
  assert.equal(inferAddDimension(artifact, "temperature", "temperature_delta"), "temperature");
  assert.equal(inferAddDimension(artifact, "temperature_delta", "temperature"), "temperature");
});

test("dimension check: temperature + temperature is flagged", () => {
  assert.throws(() => inferAddDimension(artifact, "temperature", "temperature"));
});

test("dimension check: temperature + volume is flagged", () => {
  assert.throws(() => inferAddDimension(artifact, "temperature", "volume"));
});

test("dimension check: same linear dimension addition is legal", () => {
  assert.equal(inferAddDimension(artifact, "mass", "mass"), "mass");
});

test("dimension check: temperature - temperature yields delta", () => {
  assert.equal(inferSubDimension(artifact, "temperature", "temperature"), "temperature_delta");
});

test("dimension check: temperature - volume is flagged", () => {
  assert.throws(() => inferSubDimension(artifact, "temperature", "volume"));
});
