// Describe a downloaded report bundle: every resolved path with its base-unit
// value, label, unit, and taxonomy labels. Authoring aid for a report section.
//
//   node scripts/describe-report-bundle.mjs <bundle.json>

import { readFileSync } from "node:fs";

import { UNIT_SYMBOLS } from "../frontend/src/views/registry/units.js";

function load(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function metaFor(bundle, path) {
  return bundle.catalog?.nodes?.[path] ?? null;
}

function displayMeta(meta) {
  if (!meta) return "";
  const symbol = meta.symbol ?? UNIT_SYMBOLS[meta.dimension]?.[meta.unit] ?? meta.unit;
  let unit = "";
  if (meta.unit) {
    unit = symbol && symbol !== meta.unit ? ` [${meta.unit} → ${symbol}]` : ` [${meta.unit}]`;
  }
  return `  // ${meta.label}${unit}`;
}

function walk(value, path, metaPath, out) {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      out.push({ path, metaPath, value: "[]" });
      return;
    }
    value.forEach((item, index) => walk(item, `${path}[${index}]`, metaPath, out));
    return;
  }
  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value);
    if (keys.length === 0) {
      out.push({ path, metaPath, value: "{}" });
      return;
    }
    for (const key of keys.sort()) {
      walk(value[key], `${path}.${key}`, `${metaPath}.${key}`, out);
    }
    return;
  }
  out.push({ path, metaPath, value });
}

// Option labels are the one catalog field a path/unit dump would otherwise
// drop: the glossary lists taxonomy values, not their display text.
function optionLabelLines(bundle) {
  const lines = [];
  for (const [path, meta] of Object.entries(bundle.catalog?.nodes ?? {}).sort()) {
    const labels = meta?.option_labels;
    if (!labels || Object.keys(labels).length === 0) continue;
    const pairs = Object.keys(labels)
      .sort()
      .map((key) => `${key}=${labels[key]}`);
    lines.push(`  ${path}: ${pairs.join(", ")}`);
  }
  return lines;
}

function formatLeaf(value) {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

function main(argv) {
  const file = argv[2];
  if (!file) {
    console.error("usage: node scripts/describe-report-bundle.mjs <bundle.json>");
    process.exit(2);
  }
  const bundle = load(file);
  const batch = bundle.batch ?? {};
  const lines = [
    `batch        ${batch.id ?? "?"}  ${JSON.stringify(batch.name ?? "")}`,
    `status       ${batch.status ?? "?"}${batch.frozen_at ? `  frozen_at=${batch.frozen_at}` : ""}`,
    `artifact     schema_version=${bundle.artifact?.schema_version ?? "?"}  ${bundle.artifact?.hash ?? ""}`,
    `content      ${bundle.content_hash ?? ""}`,
    "",
  ];

  const rows = [];
  for (const [nodeId, value] of Object.entries(bundle.state?.valuation ?? {}).sort()) {
    walk(value, nodeId, nodeId, rows);
  }
  for (const [namespace, component] of Object.entries(batch.identity ?? {}).sort()) {
    walk(component, namespace, namespace, rows);
  }
  rows.sort((a, b) => a.path.localeCompare(b.path));

  for (const row of rows) {
    const meta = metaFor(bundle, row.metaPath);
    lines.push(`${row.path} = ${formatLeaf(row.value)}${displayMeta(meta)}`);
  }

  const optionLabels = optionLabelLines(bundle);
  if (optionLabels.length) {
    lines.push("", "option labels", ...optionLabels);
  }

  const telemetry = bundle.telemetry ?? {};
  if (Object.keys(telemetry).length) {
    lines.push("", "telemetry");
    for (const [nodeId, entry] of Object.entries(telemetry).sort()) {
      lines.push(
        `  ${nodeId}  binding=${entry.binding}  fingerprint=${entry.fingerprint}  events=${entry.telemetry?.length ?? 0}  warnings=${entry.warnings?.length ?? 0}`
      );
    }
  }

  const validation = bundle.validation ?? {};
  lines.push(
    "",
    `validation   relations=${validation.relations?.length ?? 0}  domains=${validation.domains?.length ?? 0}  field=${validation.field_domains?.length ?? 0}  collection=${validation.collection_domains?.length ?? 0}`
  );

  console.log(lines.join("\n"));
}

main(process.argv);
