import test from "node:test";
import assert from "node:assert/strict";

import { loadUnitMode, sanitizeUnitMode, saveUnitMode } from "../../frontend/src/store/unitPrefs.js";
import { loadArtifact } from "./helpers.js";

const artifact = loadArtifact();

test("sanitizeUnitMode keeps valid keys and drops stale ones", () => {
  const out = sanitizeUnitMode(artifact, {
    temperature: "degF",                                     // valid dimension + unit
    mash_thickness: "qt_per_lb",                             // valid (newly toggleable) dimension
    "mash.grain_temp_c": "degC",                             // valid field override
    "solver.batch.mash_thickness_l_per_kg": "qt_per_lb",     // valid dotted field
    "equipment.mash_tun_mass_kg": "lb",                      // valid selection field (mass)
    nonexistent_dim: "x",                                    // unknown dimension -> dropped
    "mash.nope": "degF",                                     // unknown field -> dropped
    "batch.target_abv": "gal",                               // valid field, invalid unit -> dropped
    volume: "lightyears",                                    // valid dimension, invalid unit -> dropped
    "batch.topology": "degF",                                // choice (taxonomy) -> dropped
  });

  assert.equal(out.temperature, "degF");
  assert.equal(out.mash_thickness, "qt_per_lb");
  assert.equal(out["mash.grain_temp_c"], "degC");
  assert.equal(out["solver.batch.mash_thickness_l_per_kg"], "qt_per_lb");
  assert.equal(out["equipment.mash_tun_mass_kg"], "lb");
  for (const key of ["nonexistent_dim", "mash.nope", "batch.target_abv", "volume", "batch.topology"]) {
    assert.ok(!(key in out), `expected "${key}" to be dropped`);
  }
});

test("load/save roundtrip through localStorage (schema-version stamped)", () => {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, v),
    removeItem: (k) => store.delete(k),
  };
  try {
    saveUnitMode({ temperature: "degF", "mash.grain_temp_c": "degC" }, artifact.schema_version);
    const loaded = loadUnitMode(artifact);
    assert.equal(loaded.temperature, "degF");
    assert.equal(loaded["mash.grain_temp_c"], "degC");

    const raw = JSON.parse(store.get("brew_unit_preferences"));
    assert.equal(raw.schema_version, artifact.schema_version);
  } finally {
    delete globalThis.localStorage;
  }
});

test("loadUnitMode returns {} when localStorage is absent", () => {
  assert.deepEqual(loadUnitMode(artifact), {});
});
