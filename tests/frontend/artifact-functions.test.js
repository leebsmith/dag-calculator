import test from "node:test";
import assert from "node:assert/strict";

import {
  artifactConstant,
  callArtifactFunction,
} from "../../frontend/src/engine/artifactFunctions.js";

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
