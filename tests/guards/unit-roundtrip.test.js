// Every unit must round-trip through the base unit, and the declared transform
// must be invertible: a factor/offset drift silently rescales a displayed value.
// Nonlinear dimensions are checked through the artifact's own functions.

import test from "node:test";
import assert from "node:assert/strict";

import { callArtifactFunction } from "../../frontend/src/engine/artifactFunctions.js";
import { fromBase, toBase } from "../../frontend/src/engine/units.js";
import { artifact } from "./util.js";

const SAMPLES = {
  affine: [0, 20, 100],
  nonlinear: [0, 12, 20, 30],
  default: [0.25, 1, 12.5, 100],
};

// Linear/affine transforms are exact inverses. Nonlinear pairs are independent
// ASBC curve fits, so round-trip within their published agreement (~0.005 degP).
const TOLERANCE = {
  linear: (sample) => 1e-9 * Math.max(1, Math.abs(sample)),
  affine: (sample) => 1e-9 * Math.max(1, Math.abs(sample)),
  nonlinear: () => 1e-2,
  identity: (sample) => 1e-9 * Math.max(1, Math.abs(sample)),
};

function nonlinearFns(a) {
  const fns = {};
  for (const dim of Object.values(a.dimensions ?? {})) {
    if (dim.kind !== "nonlinear") continue;
    for (const unit of Object.values(dim.units ?? {})) {
      fns[unit.fwd] = (value) => callArtifactFunction(unit.fwd, [value]);
      fns[unit.inv] = (value) => callArtifactFunction(unit.inv, [value]);
    }
  }
  return fns;
}

test("every declared unit round-trips through its base unit", () => {
  const a = artifact();
  const nl = nonlinearFns(a);
  const failures = [];

  for (const [dimensionId, dim] of Object.entries(a.dimensions)) {
    const samples = SAMPLES[dim.kind] ?? SAMPLES.default;
    for (const [unitId, unit] of Object.entries(dim.units ?? {})) {
      if (dim.kind === "linear" && !(Number.isFinite(unit.factor) && unit.factor > 0)) {
        failures.push(`${dimensionId}.${unitId}: invalid factor ${unit.factor}`);
        continue;
      }
      if (dim.kind === "affine" && !Number.isFinite(unit.offset)) {
        failures.push(`${dimensionId}.${unitId}: invalid offset ${unit.offset}`);
        continue;
      }
      for (const sample of samples) {
        const base = toBase(a, dimensionId, unitId, sample, nl);
        if (!Number.isFinite(base)) {
          failures.push(`${dimensionId}.${unitId}: ${sample} -> non-finite base`);
          continue;
        }
        const back = fromBase(a, dimensionId, unitId, base, nl);
        const tolerance = (TOLERANCE[dim.kind] ?? TOLERANCE.linear)(sample);
        if (Math.abs(back - sample) > tolerance) {
          failures.push(`${dimensionId}.${unitId}: ${sample} -> ${base} -> ${back}`);
        }
      }
    }

    for (const sample of samples) {
      assert.equal(
        toBase(a, dimensionId, dim.base_unit, sample, nl),
        sample,
        `${dimensionId}: base unit must be the identity`
      );
      assert.equal(fromBase(a, dimensionId, dim.base_unit, sample, nl), sample);
    }
  }

  assert.deepEqual(failures, [], `unit round-trip failures:\n${failures.join("\n")}`);
});

test("shared unit factors agree across color dimensions", () => {
  const a = artifact();
  const grain = a.dimensions.grain_color.units.EBC.factor;
  const beer = a.dimensions.beer_color.units.EBC.factor;
  assert.equal(grain, beer, "grain_color and beer_color must use the same EBC factor");
});
