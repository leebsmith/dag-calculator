import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Alpine's CSP build cannot parse inline JavaScript: no arrow functions, no
// getters, no object literals in x-data, no statement sequences. This guard
// counts what still needs to move into adapters and fails when a count grows.
// Lower the baseline (--write) as each migration step lands; it must reach zero
// before `script-src` can drop 'unsafe-eval'.
//
// Usage:
//   node scripts/check-alpine-csp.mjs           # verify against the baseline
//   node scripts/check-alpine-csp.mjs --write   # record the current counts

const BASELINE = fileURLToPath(new URL("./alpine-csp-baseline.json", import.meta.url));
const PARTIALS = fileURLToPath(new URL("../frontend/src/partials/", import.meta.url));
const INDEX = fileURLToPath(new URL("../frontend/index.html", import.meta.url));

function templateFiles() {
  const partials = existsSync(PARTIALS)
    ? readdirSync(PARTIALS)
        .filter((name) => name.endsWith(".html"))
        .map((name) => `${PARTIALS}${name}`)
    : [];
  return [INDEX, ...partials].filter((path) => existsSync(path));
}

function xDataValues(text) {
  const values = [];
  for (const match of text.matchAll(/x-data\s*=\s*"([^"]*)"/gs)) values.push(match[1]);
  for (const match of text.matchAll(/x-data\s*=\s*'([^']*)'/gs)) values.push(match[1]);
  return values;
}

function countIn(haystack, needle) {
  return haystack.split(needle).length - 1;
}

const GLOBALS = /\b(?:Math|JSON|parseInt|parseFloat|Number|String|Boolean|Object|Array|Date)\s*[.(]/g;

function directAttributes(text) {
  return text
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/x-data\s*=\s*"[^"]*"/gs, "")
    .replace(/x-data\s*=\s*'[^']*'/gs, "");
}

export function measure(files = templateFiles()) {
  const totals = {
    inlineXDataLiterals: 0,
    xDataCalls: 0,
    getters: 0,
    arrowsInXData: 0,
    arrowsInDirectives: 0,
    classObjectLiterals: 0,
    optionalChaining: 0,
    nullish: 0,
    multiStatementInit: 0,
    globalCalls: 0,
    templateLiterals: 0,
  };
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    const data = xDataValues(text).join("\n");
    const rest = directAttributes(text);
    totals.inlineXDataLiterals += [...text.matchAll(/x-data\s*=\s*["']\s*\{/g)].length;
    totals.xDataCalls += [...text.matchAll(/x-data\s*=\s*["'][A-Za-z_$][\w$.]*\s*\(/g)].length;
    totals.getters += [...data.matchAll(/\bget\s+[A-Za-z_$][\w$]*\s*\(/g)].length;
    totals.arrowsInXData += countIn(data, "=>");
    totals.arrowsInDirectives += countIn(rest, "=>");
    totals.classObjectLiterals += [...rest.matchAll(/:class\s*=\s*"\s*\{/g)].length;
    totals.optionalChaining += [...rest.matchAll(/\?\./g)].length;
    totals.nullish += [...rest.matchAll(/\?\?/g)].length;
    totals.multiStatementInit += [...rest.matchAll(/x-init\s*=\s*"[^"]*;[^"]*"/g)].length;
    totals.globalCalls += [...rest.matchAll(GLOBALS)].length;
    totals.templateLiterals += [...rest.matchAll(/`/g)].length;
  }
  return totals;
}

function report(current, baseline) {
  const rows = Object.keys(current).map((key) => {
    const limit = Number.isInteger(baseline?.[key]) ? baseline[key] : current[key];
    return { key, current: current[key], limit, delta: current[key] - limit };
  });
  const width = Math.max(...rows.map((row) => row.key.length));
  for (const row of rows) {
    const mark = row.delta > 0 ? "GROWTH" : row.delta < 0 ? "improved" : "";
    console.log(
      `alpine csp: ${row.key.padEnd(width)}  ${String(row.current).padStart(3)}  (limit ${row.limit}${mark ? `, ${mark}` : ""})`
    );
  }
  return rows.filter((row) => row.delta > 0);
}

const write = process.argv.includes("--write");
const current = measure();
const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, "utf8")) : null;

if (write || !baseline) {
  writeFileSync(BASELINE, `${JSON.stringify(current, null, 2)}\n`);
  console.log(`alpine csp: baseline written to scripts/alpine-csp-baseline.json`);
  process.exit(0);
}

const grown = report(current, baseline);
if (grown.length > 0) {
  console.error(
    `alpine csp: ${grown.length} metric(s) grew; move the logic into adapters or lower the baseline with --write`
  );
  process.exitCode = 1;
} else {
  const remaining = current.arrowsInXData + current.arrowsInDirectives;
  console.log(`alpine csp: ${remaining} expression(s) still need to move before 'unsafe-eval' can go`);
}
