// Step C — frontend differential conformance.
//
// Runs the NEW engine's artifact functions alongside the LEGACY "known-good"
// pure modules (oracle) on a shared corpus and asserts equality (within
// tolerance). Skips gracefully when the oracle repo is not present.
//
// Oracle repo path: $BREWING_ORACLE_REPO, default ~/Development/brewing-calculator.

import test from "node:test";
import assert from "node:assert/strict";
import { homedir } from "node:os";
import { pathToFileURL } from "node:url";

import { evaluate } from "../../frontend/src/engine/index.js";
import { loadArtifact as readArtifact } from "../frontend/helpers.js";

const artifact = readArtifact();
const oracleRepo = process.env.BREWING_ORACLE_REPO || `${homedir()}/Development/brewing-calculator`;

async function tryImport(rel) {
  try {
    return await import(pathToFileURL(`${oracleRepo}/${rel}`).href);
  } catch {
    return null;
  }
}

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

const pure = await tryImport("frontend/src/utils/pureFunctions.js");
const mash = await tryImport("frontend/src/utils/mashSchedule.js");
const water = await tryImport("frontend/src/utils/waterChemistry.js");

const haveOracle = Boolean(pure && mash && water);
const requireOracle = process.env.REQUIRE_ORACLE === "1";
if (!haveOracle && requireOracle) {
  throw new Error(
    `REQUIRE_ORACLE=1 but the oracle modules are missing at ${oracleRepo} ` +
      "(set BREWING_ORACLE_REPO to the legacy checkout)"
  );
}
const opts = haveOracle ? {} : { skip: `oracle not found at ${oracleRepo}` };

function close(actual, expected, tol = 1e-9, label = "") {
  assert.ok(
    Math.abs(actual - expected) <= tol,
    `${label} expected ${actual} ≈ ${expected} (Δ=${Math.abs(actual - expected)})`
  );
}

test("conformance: extract_yield_ldk ↔ calculateMetricLiterDegreesPerKg", opts, () => {
  for (const y of [0, 0.5, 0.74, 0.8, 1.0]) {
    close(evalFn("extract_yield_ldk", [y]), pure.calculateMetricLiterDegreesPerKg(y), 1e-9, `yield=${y}`);
  }
});

test("conformance: sugar_gravity_points ↔ sugarGravityPoints", opts, () => {
  for (const [m, y, v] of [[0.5, 0.8, 20], [1.25, 0.74, 19], [0.2, 0.95, 23.5]]) {
    close(
      evalFn("sugar_gravity_points", [m, y, v]),
      pure.sugarGravityPoints(m, y, v),
      1e-9,
      `m=${m}`
    );
  }
});

test("conformance: strike base temp ↔ calculateStrikeWaterTempC", opts, () => {
  for (const [t, g, th] of [[67, 20, 3.0], [66, 18.5, 2.6079], [72, 22, 4.5]]) {
    close(
      evalFn("calculate_strike_water_base_temp", [t, g, th]),
      mash.calculateStrikeWaterTempC(t, g, th),
      1e-9,
      `t=${t}`
    );
  }
});

test("conformance: tun thermal offset ↔ calculateTunThermalOffsetC", opts, () => {
  for (const [t, ti, sh, tm, wm] of [[67, 20, 0.12, 7.5, 14], [66, 19, 0.12, 6.5, 12.2]]) {
    close(
      evalFn("calculate_tun_thermal_offset", [t, ti, sh, tm, wm]),
      mash.calculateTunThermalOffsetC(t, ti, sh, tm, wm),
      1e-9,
      `t=${t}`
    );
  }
});

test("conformance: bicarbonate_from_alkalinity ↔ bicarbonateFromAlkalinity", opts, () => {
  for (const a of [0, 40, 78, 150.5]) {
    close(evalFn("bicarbonate_from_alkalinity", [a]), water.bicarbonateFromAlkalinity(a), 1e-9, `alk=${a}`);
  }
});

test("conformance: estimate_single_rest_loa_pct ↔ estimateSingleRestLoaPct", opts, () => {
  for (const tc of [64, 65.5, 66, 67, 68, 70]) {
    close(
      evalFn("estimate_single_rest_loa_pct", [tc]),
      mash.estimateSingleRestLoaPct(tc),
      1e-9,
      `temp=${tc}`
    );
  }
});

// Color intentionally diverges from the legacy flat `EBC = 1.97·L` approximation;
// the artifact splits color into `grain_color` (Lovibond) and `beer_color` (SRM),
// each linear ×1.97 to EBC (schema_version 3). The single-malt
// `morey_lovibond_to_srm` bridge was removed; the finished-beer MCU→Morey path
// remains (`morey_mcu_to_srm`). Assert the surviving reference formula directly.
test("conformance: morey_mcu_to_srm vs reference (documented delta)", () => {
  for (const mcu of [1, 4, 8, 20]) {
    close(evalFn("morey_mcu_to_srm", [mcu]), 1.4922 * Math.pow(mcu, 0.6859), 1e-9, `mcu=${mcu}`);
  }
});

