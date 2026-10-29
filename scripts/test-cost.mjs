// Test-cost ledger: one row per suite file, so a change is measured against the
// same instrument before and after rather than against an opinion.
//
// Frontend rows are wall time. Each file runs in its own process
// (`node --test-reporter=tap <file>`), so a row is that file's uncontended cost:
// module import, app boot and its tests. Running the files one at a time is the
// point — concurrency moves work between rows without shrinking any of them.
//
// Backend rows are the file's pytest testcase time, summed from one JUnit XML
// run; a per-module wall time needs a pytest plugin, and a plugin is a
// dependency. The whole backend wall is reported separately, so the difference
// is the process start and collection the files share.
//
// The boot column is a source scan: the file calls `createTestApp(`,
// `createStepApp(`, `sharedTestApp(` or `withFreshApp(`. It says a suite boots
// an app, not how many times it boots one — and since the shared helpers boot one
// app per suite process, a converted suite still boots one.
//
// Usage, from the repo root:
//   node scripts/test-cost.mjs              # both lanes
//   node scripts/test-cost.mjs --frontend   # frontend only
//   node scripts/test-cost.mjs --backend    # backend only
//
// It measures; it does not judge. Exits non-zero only when a suite failed.

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const FRONTEND_DIRS = ["tests/frontend", "tests/conformance", "tests/guards"];
const BACKEND_DIR = "tests/backend";
const BOOTS_APP = [
  /\bcreateTestApp\s*\(/,
  /\bcreateStepApp\s*\(/,
  /\bsharedTestApp\s*\(/,
  /\bwithFreshApp\s*\(/,
];
const OUTPUT_LIMIT = 64 * 1024 * 1024;

function collect(dir, matches, out = []) {
  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) collect(path, matches, out);
    else if (matches(entry.name)) out.push(path);
  }
  return out;
}

function discover(dir, matches) {
  try {
    return collect(dir, matches);
  } catch (error) {
    throw new Error(`cannot read ${dir}: ${error.message}`);
  }
}

function frontendFiles() {
  return FRONTEND_DIRS.flatMap((dir) => discover(dir, (name) => name.endsWith(".test.js")));
}

function backendFiles() {
  const matches = (name) => /^test_.*\.py$/.test(name);
  return discover(BACKEND_DIR, matches);
}

function summaryValue(output, pattern) {
  const match = pattern.exec(output);
  return match ? Number(match[1]) : 0;
}

function bootsApp(file) {
  const source = readFileSync(join(ROOT, file), "utf8");
  return BOOTS_APP.some((marker) => marker.test(source));
}

function measureFrontend(file) {
  const started = Date.now();
  const run = spawnSync(process.execPath, ["--test-reporter=tap", file], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: OUTPUT_LIMIT,
  });
  const output = `${run.stdout ?? ""}\n${run.stderr ?? ""}`;
  return {
    file,
    ms: Date.now() - started,
    tests: summaryValue(output, /^# tests (\d+)$/m),
    boots: bootsApp(file),
    ok: run.status === 0,
  };
}

function parseJunit(xml, files) {
  const keys = new Map(
    files.map((file) => [file.replace(/\.py$/, "").replaceAll("/", "."), file])
  );
  const rows = new Map(
    files.map((file) => [file, { file, ms: 0, tests: 0, failed: 0, boots: undefined }])
  );
  for (const chunk of xml.split("<testcase").slice(1)) {
    const head = chunk.split(">")[0];
    const classname = /classname="([^"]*)"/.exec(head)?.[1] ?? "";
    const secondsValue = Number(/time="([^"]*)"/.exec(head)?.[1] ?? 0);
    const key = [...keys.keys()].find(
      (dotted) => classname === dotted || classname.startsWith(`${dotted}.`)
    );
    if (key === undefined) continue;
    const row = rows.get(keys.get(key));
    row.ms += secondsValue * 1000;
    row.tests += 1;
    if (chunk.includes("<failure") || chunk.includes("<error")) row.failed += 1;
  }
  return [...rows.values()];
}

function measureBackend(files) {
  const dir = mkdtempSync(join(tmpdir(), "dag-test-cost-"));
  const report = join(dir, "pytest.xml");
  const started = Date.now();
  const run = spawnSync(
    "uv",
    ["run", "pytest", `../${BACKEND_DIR}/`, "-q", "--junit-xml", report],
    { cwd: join(ROOT, "backend"), encoding: "utf8", maxBuffer: OUTPUT_LIMIT }
  );
  const wallMs = Date.now() - started;
  let xml = "";
  try {
    xml = readFileSync(report, "utf8");
  } catch {
    xml = "";
  }
  rmSync(dir, { recursive: true, force: true });
  return { rows: parseJunit(xml, files), wallMs, ok: run.status === 0 };
}

function printRow(row, withBoot) {
  const cells = `${String(Math.round(row.ms)).padStart(7)} ${String(row.tests).padStart(6)}`;
  const boot = withBoot ? `  ${(row.boots ? "yes" : "-").padEnd(4)}` : "";
  const status = row.ok === false ? "  FAILED" : "";
  console.log(`${cells}${boot}  ${row.file}${status}`);
}

function printHeader(withBoot) {
  const cells = `${"ms".padStart(7)} ${"tests".padStart(6)}`;
  console.log(withBoot ? `${cells}  ${"boot".padEnd(4)}  file` : `${cells}  file`);
}

function seconds(ms) {
  return `${(ms / 1000).toFixed(1)} s`;
}

function runFrontend() {
  const files = frontendFiles();
  if (files.length === 0) throw new Error(`${FRONTEND_DIRS.join(", ")} hold no test files`);
  console.log(`\nfrontend suites: ${files.length} files, one process each, serial`);
  printHeader(true);
  const rows = files.map((file) => {
    const row = measureFrontend(file);
    printRow(row, true);
    return row;
  });
  const total = rows.reduce(
    (sum, row) => ({
      ms: sum.ms + row.ms,
      tests: sum.tests + row.tests,
      boots: sum.boots + (row.boots ? 1 : 0),
      failed: sum.failed + (row.ok ? 0 : 1),
    }),
    { ms: 0, tests: 0, boots: 0, failed: 0 }
  );
  console.log(
    `\nfrontend totals: ${files.length} files, ${total.tests} tests, ` +
      `${total.boots} boot an app, ${seconds(total.ms)} serial`
  );
  return total;
}

function runBackend() {
  const files = backendFiles();
  if (files.length === 0) throw new Error(`${BACKEND_DIR} holds no test files`);
  console.log(`\nbackend suites: ${files.length} files, one pytest run`);
  const measured = measureBackend(files);
  const rows = measured.rows.map((row) => ({ ...row, ok: row.failed === 0 }));
  printHeader(false);
  for (const row of rows) printRow(row, false);
  const total = rows.reduce(
    (sum, row) => ({
      ms: sum.ms + row.ms,
      tests: sum.tests + row.tests,
      failedRows: sum.failedRows + (row.failed > 0 ? 1 : 0),
    }),
    { ms: 0, tests: 0, failed: 0, failedRows: 0 }
  );
  console.log(
    `\nbackend totals: ${files.length} files, ${total.tests} tests, ` +
      `${seconds(measured.wallMs)} wall, ${seconds(total.ms)} inside pytest rows`
  );
  const failed = total.failedRows > 0 ? total.failedRows : measured.ok ? 0 : 1;
  return { ...total, failed, wallMs: measured.wallMs };
}

function parseLanes(argv) {
  const known = ["--frontend", "--backend"];
  const unknown = argv.filter((arg) => !known.includes(arg));
  if (unknown.length > 0) throw new Error(`unknown option(s): ${unknown.join(" ")}`);
  return {
    frontend: !argv.includes("--backend"),
    backend: !argv.includes("--frontend"),
  };
}

function main() {
  const lanes = parseLanes(process.argv.slice(2));
  const parts = [];
  let failed = 0;
  if (lanes.frontend) {
    const frontend = runFrontend();
    failed += frontend.failed;
    parts.push(`frontend ${seconds(frontend.ms)} serial`);
  }
  if (lanes.backend) {
    const backend = runBackend();
    failed += backend.failed;
    parts.push(`backend ${seconds(backend.wallMs)} wall`);
  }
  console.log(`\ntest-cost: ${parts.join(", ")}`);
  if (failed > 0) {
    console.error(`test-cost: ${failed} suite(s) failed`);
    process.exitCode = 1;
  }
}

try {
  main();
} catch (error) {
  console.error(`test-cost: ${error.message}`);
  process.exitCode = 1;
}
