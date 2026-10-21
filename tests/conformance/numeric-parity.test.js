// Cross-runtime numeric parity: the artifact functions must reproduce the
// shared fixture consumed by tests/backend/conformance/test_numeric_parity.py.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { createCalculator } from "../../frontend/src/engine/index.js";
import { loadArtifact } from "../frontend/helpers.js";

const artifact = loadArtifact();
const engine = createCalculator(artifact);
const fixture = JSON.parse(
  readFileSync(new URL("./fixtures/numeric-parity.json", import.meta.url), "utf8")
);

function call(fnId, args) {
  return engine.call(fnId, args);
}

function close(actual, expected, label, tolerance = 1e-9) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label}: expected ${actual} ≈ ${expected} (Δ=${Math.abs(actual - expected)})`
  );
}

test("numeric parity: ASBC Plato -> SG", () => {
  for (const { plato, sg } of fixture.plato_to_sg) {
    close(call("plato_to_sg", [plato]), sg, `plato=${plato}`);
  }
});

test("numeric parity: ASBC SG -> Plato", () => {
  for (const { sg, plato } of fixture.sg_to_plato) {
    close(call("sg_to_plato", [sg]), plato, `sg=${sg}`);
  }
});

test("numeric parity: Cutaia ABV", () => {
  for (const { og_sg, aa, abv } of fixture.cutaia_abv) {
    close(call("realized_abv", [og_sg, aa]), abv, `og=${og_sg} aa=${aa}`);
  }
});

test("numeric parity: maximum achievable ABV", () => {
  for (const { og_sg, aa, abv } of fixture.max_achievable_abv) {
    close(call("realized_abv", [og_sg, aa]), abv, `aa=${aa}`);
  }
});

test("numeric parity: Phase 1 SG-from-ABV inverse", () => {
  for (const { target_abv, aa, sg } of fixture.phase1_sg_from_abv) {
    close(call("realized_abv", [sg, aa]), target_abv, `target=${target_abv} aa=${aa}`, 1e-3);
  }
});
