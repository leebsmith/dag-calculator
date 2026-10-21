import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { canonicalize, canonicalFingerprint, BoundaryCache } from "../../frontend/src/engine/boundary.js";

const FIXTURE = JSON.parse(
  readFileSync(new URL("../conformance/fixtures/canonical-json.json", import.meta.url), "utf8")
);

const SPECIAL_FLOATS = {
  NaN: NaN,
  Infinity: Infinity,
  "-Infinity": -Infinity,
};

test("canonical JSON matches the backend golden string", () => {
  assert.equal(canonicalize(FIXTURE.batch.request), FIXTURE.batch.canonical);
});

test("fingerprint matches the backend golden SHA-256", () => {
  assert.equal(canonicalFingerprint(FIXTURE.batch.request), FIXTURE.batch.fingerprint);
});

test("canonicalize formats floats like the backend", () => {
  for (const { value, expected } of FIXTURE.floats) {
    assert.equal(canonicalize(value), expected, `float ${value}`);
  }
});

test("canonicalize collapses non-finite floats to null", () => {
  for (const { value, expected } of FIXTURE.special_floats) {
    assert.equal(canonicalize(SPECIAL_FLOATS[value]), expected, `float ${value}`);
  }
});

test("canonicalize escapes unicode strings like the backend", () => {
  for (const { value, canonical } of FIXTURE.strings) {
    assert.equal(canonicalize(value), canonical);
  }
});

test("canonical vectors match the shared fixture", () => {
  for (const vector of FIXTURE.vectors) {
    assert.equal(canonicalize(vector.value), vector.canonical, vector.name);
    assert.equal(canonicalFingerprint(vector.value), vector.fingerprint, vector.name);
  }
});

test("canonicalize sorts object keys deterministically", () => {
  const a = { z: 1, a: 2, m: { b: 3, a: 4 } };
  assert.equal(canonicalize(a), '{"a":2,"m":{"a":4,"b":3},"z":1}');
});

test("BoundaryCache get/set/has", () => {
  const cache = new BoundaryCache();
  const fp = canonicalFingerprint({ x: 1 });
  assert.equal(cache.has(fp), false);
  cache.set(fp, { outputs: { y: 2 } });
  assert.equal(cache.has(fp), true);
  assert.deepEqual(cache.get(fp), { outputs: { y: 2 } });
});
