// Step C — frontend differential conformance, snapshotted.
//
// The legacy "known-good" pure modules were the migration oracle. Their scalar
// outputs are frozen in `fixtures/oracle-parity.json` so this suite runs
// everywhere, with no checkout of the legacy repo. Refresh the fixture against a
// live oracle with `make test-oracle` (see `emit-oracle-fixture.mjs`).

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { evaluate } from "../../frontend/src/engine/index.js";
import { loadArtifact } from "../frontend/helpers.js";

const artifact = loadArtifact();
const fixture = JSON.parse(
  readFileSync(new URL("./fixtures/oracle-parity.json", import.meta.url), "utf8")
);

function evalFn(fnId, args) {
  const fn = artifact.functions[fnId];
  const ctx = {
    resolveRef: (name) => {
      const i = fn.params.indexOf(name);
      if (i === -1) throw new Error(`unknown param "${name}" in ${fnId}`);
      return args[i];
    },
    resolveConst: (id) => artifact.constants[id].value,
    call: () => {
      throw new Error("nested calls are not exercised by conformance");
    },
  };
  return evaluate(fn.body, ctx);
}

test(`conformance: artifact functions match ${fixture.cases.length} snapshotted oracle values`, () => {
  const failures = [];

  for (const { fn, args, expected } of fixture.cases) {
    const actual = evalFn(fn, args);
    const delta = Math.abs(actual - expected);
    if (!(delta <= fixture.tolerance)) {
      failures.push(`${fn}(${args.join(", ")}): ${actual} vs ${expected} (Δ=${delta})`);
    }
  }

  assert.deepEqual(failures, [], failures.join("\n"));
});

test("conformance: the snapshot covers every migrated scalar formula", () => {
  const covered = new Set(fixture.cases.map((entry) => entry.fn));
  assert.deepEqual([...covered].sort(), [
    "bicarbonate_from_alkalinity",
    "calculate_strike_water_base_temp",
    "calculate_tun_thermal_offset",
    "estimate_single_rest_loa_pct",
    "extract_yield_ldk",
    "sugar_gravity_points",
  ]);
});

// Color intentionally diverges from the legacy flat `EBC = 1.97·L` approximation;
// the artifact splits color into `grain_color` (Lovibond) and `beer_color` (SRM),
// each linear ×1.97 to EBC (schema_version 3). The single-malt
// `morey_lovibond_to_srm` bridge was removed; the finished-beer MCU→Morey path
// remains (`morey_mcu_to_srm`). Assert the surviving reference formula directly.
test("conformance: morey_mcu_to_srm vs reference (documented delta)", () => {
  for (const mcu of [1, 4, 8, 20]) {
    const actual = evalFn("morey_mcu_to_srm", [mcu]);
    const expected = 1.4922 * Math.pow(mcu, 0.6859);
    assert.ok(
      Math.abs(actual - expected) <= 1e-9,
      `mcu=${mcu} expected ${actual} ≈ ${expected}`
    );
  }
});
