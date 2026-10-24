import test from "node:test";
import assert from "node:assert/strict";

import {
  artifactConstant,
  callArtifactFunction,
} from "../../frontend/src/engine/artifactFunctions.js";
import { fromBase } from "../../frontend/src/engine/units.js";
import { loadArtifact } from "./helpers.js";

const artifact = loadArtifact();

test("artifact constants are exposed to host-side math", () => {
  assert.equal(artifactConstant("cutaia_a"), 0.372);
  assert.equal(artifactConstant("ethanol_density"), 0.7907);
});

test("artifact functions evaluate without an engine or session", () => {
  assert.equal(callArtifactFunction("blend_ion", [100, 0, 10, 0, 10]), 50);
  assert.equal(callArtifactFunction("blend_ion", [10, 10, 0, 0, 0]), null);
  assert.equal(callArtifactFunction("sulfate_chloride_ratio", [100, 50]), 2);
  assert.equal(callArtifactFunction("sulfate_chloride_ratio", [100, 0]), null);
});

test("strike-water chain reproduces the 30 lb tun / 7.4 gal case", () => {
  const targetC = 70;
  const ambientC = 20;
  const thicknessLPerKg = 3.0;
  const tunMassKg = 30 * 0.45359237;
  const strikeL = 7.4 * 3.785411784;

  const base = callArtifactFunction("calculate_strike_water_base_temp", [
    targetC,
    ambientC,
    thicknessLPerKg,
  ]);
  const offset = callArtifactFunction("calculate_tun_thermal_offset", [
    targetC,
    ambientC,
    0.12,
    tunMassKg,
    strikeL,
  ]);

  assert.ok(Math.abs(fromBase(artifact, "temperature", "degF", base) - 170.3) < 0.1);
  assert.ok(Math.abs(fromBase(artifact, "temperature_delta", "dF", offset) - 5.24) < 0.02);
  assert.ok(Math.abs(fromBase(artifact, "temperature", "degF", base + offset) - 175.5) < 0.1);
});
