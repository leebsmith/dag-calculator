// Attenuation cap readout: blend AA, malt cap, and the uncapped sugar lift.

import test from "node:test";
import assert from "node:assert/strict";

import { attenuationCapSummary } from "../../frontend/src/views/producer/attenuationCap.js";

test("a fully fermentable sugar share can lift the blend above the malt cap", () => {
  const summary = attenuationCapSummary(0.796, 0.77);
  assert.equal(summary.blend, 0.796);
  assert.equal(summary.cap, 0.77);
  assert.ok(Math.abs(summary.lift - 0.026) < 1e-12);
});

test("a blend below the cap reports no lift", () => {
  const summary = attenuationCapSummary(0.75, 0.77);
  assert.equal(summary.lift, 0);
});

test("missing blend or cap is reported as null, not zero", () => {
  assert.deepEqual(attenuationCapSummary(undefined, 0.77), {
    blend: null,
    cap: 0.77,
    lift: null,
  });
  assert.deepEqual(attenuationCapSummary(0.796, null), {
    blend: 0.796,
    cap: null,
    lift: null,
  });
});
