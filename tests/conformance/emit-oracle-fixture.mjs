// Snapshot the legacy oracle's scalar outputs into the committed parity fixture.
//
// Usage:
//   node tests/conformance/emit-oracle-fixture.mjs --write   # refresh the fixture
//   node tests/conformance/emit-oracle-fixture.mjs --check   # fail if stale
//
// The oracle lives at $BREWING_ORACLE_REPO (default ~/Development/brewing-calculator).
// `make test-oracle` runs the check; `make test` reads only the committed fixture.

import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

const FIXTURE = fileURLToPath(new URL("./fixtures/oracle-parity.json", import.meta.url));
const ORACLE_REPO =
  process.env.BREWING_ORACLE_REPO || `${homedir()}/Development/brewing-calculator`;
const TOLERANCE = 1e-9;

const ORACLE = {
  extract_yield_ldk: ["frontend/src/utils/pureFunctions.js", "calculateMetricLiterDegreesPerKg"],
  sugar_gravity_points: ["frontend/src/utils/pureFunctions.js", "sugarGravityPoints"],
  calculate_strike_water_base_temp: [
    "frontend/src/utils/mashSchedule.js",
    "calculateStrikeWaterTempC",
  ],
  calculate_tun_thermal_offset: [
    "frontend/src/utils/mashSchedule.js",
    "calculateTunThermalOffsetC",
  ],
  bicarbonate_from_alkalinity: [
    "frontend/src/utils/waterChemistry.js",
    "bicarbonateFromAlkalinity",
  ],
};

const CASES = [
  ...[0, 0.5, 0.74, 0.8, 1.0].map((y) => ({ fn: "extract_yield_ldk", args: [y] })),
  ...[[0.5, 0.8, 20], [1.25, 0.74, 19], [0.2, 0.95, 23.5]].map((args) => ({
    fn: "sugar_gravity_points",
    args,
  })),
  ...[[67, 20, 3.0], [66, 18.5, 2.6079], [72, 22, 4.5]].map((args) => ({
    fn: "calculate_strike_water_base_temp",
    args,
  })),
  ...[[67, 20, 0.12, 7.5, 14], [66, 19, 0.12, 6.5, 12.2]].map((args) => ({
    fn: "calculate_tun_thermal_offset",
    args,
  })),
  ...[0, 40, 78, 150.5].map((a) => ({ fn: "bicarbonate_from_alkalinity", args: [a] })),
];

const mode = process.argv[2] ?? "--check";
if (mode !== "--check" && mode !== "--write") {
  console.error(`unknown mode "${mode}" (expected --check or --write)`);
  process.exit(2);
}

const modules = new Map();

async function oracleValue(fn, args) {
  const entry = ORACLE[fn];
  if (!entry) throw new Error(`no oracle mapping for "${fn}"`);
  const [rel, name] = entry;
  if (!modules.has(rel)) {
    try {
      modules.set(rel, await import(pathToFileURL(`${ORACLE_REPO}/${rel}`).href));
    } catch {
      modules.set(rel, null);
    }
  }
  const mod = modules.get(rel);
  if (!mod) {
    throw new Error(
      `oracle module missing: ${ORACLE_REPO}/${rel} (set BREWING_ORACLE_REPO to the legacy checkout)`
    );
  }
  const value = mod[name](...args);
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`oracle ${name}(${args.join(", ")}) returned ${value}`);
  }
  return value;
}

const fresh = [];
for (const { fn, args } of CASES) {
  fresh.push({ fn, args, expected: await oracleValue(fn, args) });
}

if (mode === "--write") {
  const payload = {
    source: "legacy brewing-calculator pure modules (frontend/src/utils)",
    generated_by: "tests/conformance/emit-oracle-fixture.mjs",
    tolerance: TOLERANCE,
    cases: fresh,
  };
  writeFileSync(FIXTURE, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`wrote ${fresh.length} oracle cases to tests/conformance/fixtures/oracle-parity.json`);
} else {
  const fixture = JSON.parse(readFileSync(FIXTURE, "utf8"));
  const stored = new Map(fixture.cases.map((c) => [`${c.fn}|${JSON.stringify(c.args)}`, c.expected]));
  const stale = [];
  for (const { fn, args, expected } of fresh) {
    const key = `${fn}|${JSON.stringify(args)}`;
    if (!stored.has(key)) {
      stale.push(`${fn}(${args.join(", ")}): missing from fixture`);
    } else if (Math.abs(stored.get(key) - expected) > TOLERANCE) {
      stale.push(`${fn}(${args.join(", ")}): fixture ${stored.get(key)} vs oracle ${expected}`);
    }
  }
  for (const key of stored.keys()) {
    if (!fresh.some((c) => `${c.fn}|${JSON.stringify(c.args)}` === key)) {
      stale.push(`${key}: fixture case no longer generated`);
    }
  }
  if (stale.length) {
    console.error("oracle fixture is stale - run with --write:");
    for (const line of stale) console.error(`  ${line}`);
    process.exit(1);
  }
  console.log(`oracle fixture is current (${fresh.length} cases)`);
}
