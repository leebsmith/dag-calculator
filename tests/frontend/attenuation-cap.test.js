// Attenuation cap readout: the two figures the card prints. The lift above the
// cap is the artifact value `batch.attenuation_above_cap`, not a local delta.

import test from "node:test";
import assert from "node:assert/strict";

import { attenuationCapSummary } from "../../frontend/src/views/producer/attenuationCap.js";

test("a blend and cap pass through unchanged", () => {
  assert.deepEqual(attenuationCapSummary(0.796, 0.77), {
    blend: 0.796,
    cap: 0.77,
  });
});

test("missing blend or cap is reported as null, not zero", () => {
  assert.deepEqual(attenuationCapSummary(undefined, 0.77), {
    blend: null,
    cap: 0.77,
  });
  assert.deepEqual(attenuationCapSummary(0.796, null), {
    blend: 0.796,
    cap: null,
  });
  assert.deepEqual(attenuationCapSummary(Number.NaN, Number.POSITIVE_INFINITY), {
    blend: null,
    cap: null,
  });
});
