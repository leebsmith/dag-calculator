import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { fileURLToPath } from "node:url";

import { surfaceManifest } from "../frontend/src/views/registry/surface.generated.js";

const ROOT = new URL("../", import.meta.url);

function readJson(relative) {
  return JSON.parse(readFileSync(new URL(relative, ROOT), "utf8"));
}

let labelsCache = null;
let gapsCache = null;

function labels() {
  labelsCache ??= readJson("data/labels.json");
  return labelsCache;
}

function gaps() {
  gapsCache ??= readJson("data/report-parity.json").gaps ?? {};
  return gapsCache;
}

function labelFor(path) {
  return labels()[path]?.label ?? path;
}

function scalarRows(bundle) {
  const allowed = gaps();
  return Object.entries(bundle.formatted ?? {}).map(([path, cell]) => ({
    path,
    label: labelFor(path),
    text: cell?.text ?? null,
    known: Boolean(surfaceManifest.paths[path]),
    allowlisted: Boolean(allowed[path]),
    reason: allowed[path] ?? null,
  }));
}

function tableRows(bundle) {
  return Object.entries(bundle.formatted_tables ?? {}).map(([id, rows]) => ({
    id,
    label: labelFor(id),
    columns: Object.keys(rows[0] ?? {}).map((column) => ({
      id: column,
      label: labelFor(`${id}.${column}`),
    })),
    rows: rows.map((row) =>
      Object.fromEntries(Object.entries(row).map(([column, cell]) => [column, cell?.text ?? null]))
    ),
  }));
}

function summaryRows(bundle) {
  return Object.entries(bundle.formatted_summaries ?? {}).map(([id, values]) => ({
    id,
    label: id === "overall" ? "Overall" : labelFor(id),
    values: Object.entries(values).map(([metric, cell]) => ({
      metric,
      label: labelFor(`${id}.${metric}`),
      text: cell?.text ?? null,
    })),
  }));
}

function validationRows(bundle) {
  const validation = bundle.validation ?? {};
  const failing = (entries) => (entries ?? []).filter((entry) => entry.holds === false);
  return {
    relations: failing(validation.relations).map((entry) => entry.id),
    domains: failing(validation.domains).length,
    fieldDomains: failing(validation.field_domains).length,
    collectionDomains: failing(validation.collection_domains).length,
  };
}

export function renderBundle(bundle) {
  const scalars = scalarRows(bundle);
  const tables = tableRows(bundle);
  const summaries = summaryRows(bundle);
  return {
    name: bundle.batch?.name ?? "unnamed bundle",
    scalars,
    tables,
    summaries,
    validation: validationRows(bundle),
    unknown: scalars.filter((row) => !row.known).map((row) => row.path),
    missing: scalars.filter((row) => row.text === null).map((row) => row.path),
  };
}

function printText(result) {
  console.log(`bundle: ${result.name}`);
  console.log(`scalars (${result.scalars.length})`);
  for (const row of result.scalars) {
    const marker = row.allowlisted ? " [allowlisted]" : row.known ? "" : " [unlisted]";
    const text = row.text ?? "(unavailable)";
    console.log(`  ${row.label}: ${text}${marker}`);
  }
  console.log(`tables (${result.tables.length})`);
  for (const table of result.tables) {
    console.log(`  ${table.label}`);
    for (const row of table.rows) {
      console.log(`    ${table.columns.map((column) => `${column.label}: ${row[column.id] ?? "—"}`).join(" | ")}`);
    }
  }
  console.log(`summaries (${result.summaries.length})`);
  for (const summary of result.summaries) {
    console.log(`  ${summary.label}`);
    for (const value of summary.values) {
      console.log(`    ${value.label}: ${value.text ?? "—"}`);
    }
  }
  const v = result.validation;
  console.log(
    `validation: ${v.relations.length} failing relation(s), ` +
      `${v.domains + v.fieldDomains + v.collectionDomains} failing domain(s)`
  );
  if (result.unknown.length > 0) console.log(`unlisted: ${result.unknown.join(", ")}`);
  const allowlisted = result.scalars.filter((row) => row.allowlisted);
  for (const row of allowlisted) console.log(`allowlisted: ${row.path} — ${row.reason}`);
}

function main() {
  const args = process.argv.slice(2);
  const path = args.find((arg) => !arg.startsWith("--"));
  const target = path ?? fileURLToPath(new URL("../tests/conformance/fixtures/report-bundle.json", import.meta.url));
  const bundle = JSON.parse(readFileSync(target, "utf8"));
  const result = renderBundle(bundle);
  if (args.includes("--json")) console.log(JSON.stringify(result, null, 2));
  else printText(result);
}

if (process.argv[1] && basename(process.argv[1]) === "render-bundle.mjs") main();

export { main };
