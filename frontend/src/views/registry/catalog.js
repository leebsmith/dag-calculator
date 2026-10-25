// Report catalog: the per-path presentation facts a report generator needs.
// Dimensions come from the artifact; labels, display units, decimals, and
// option labels come from the presentation registries. Pure — no engine state,
// no formatting. Every resolvable path is emitted so a report can address any
// node, selection field, collection field, boundary output, or identity field.

import { resolveReference } from "../../engine/paths.js";
import { nodeDimension, valueSpecOf } from "../../engine/units.js";
import { registry } from "./index.js";
import { steps } from "../steps.js";
import { UNIT_DIMENSIONS, unitDecimals } from "./units.js";
import { WATER_IONS } from "./water.js";

const LABEL_WORDS = {
  abv: "ABV",
  fg: "FG",
  ibu: "IBU",
  id: "ID",
  og: "OG",
  ph: "pH",
  srm: "SRM",
  tds: "TDS",
  url: "URL",
};

function humanize(path) {
  return path
    .split(".")
    .at(-1)
    .split("_")
    .filter(Boolean)
    .map((word) => LABEL_WORDS[word] ?? word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

function ionLabel(path) {
  if (!path.startsWith("water.") && !path.startsWith("solver.water.")) return null;
  const leaf = path.split(".").at(-1);
  const row = WATER_IONS.find((ion) => ion.ion === leaf || ion.source === leaf);
  return row?.label ?? null;
}

function fieldSpec(artifact, ref) {
  if (ref.kind === "identity") {
    const schemaId = artifact.identity?.[ref.namespace];
    return artifact.primitive_schemas?.[schemaId]?.[ref.suffix[0]] ?? null;
  }
  const node = artifact.nodes[ref.nodeId];
  if (ref.suffix.length === 0) return null;
  const suffix = ref.suffix.join(".");
  if (node?.kind === "boundary") return node.outputs?.[suffix] ?? null;
  if (node?.kind === "selection" || node?.kind === "collection") {
    const spec = valueSpecOf(artifact, ref.nodeId);
    const schemaId = spec?.schema ?? spec?.item_schema;
    return artifact.primitive_schemas?.[schemaId]?.[ref.suffix[0]] ?? null;
  }
  return null;
}

function dimensionOf(artifact, path) {
  const ref = resolveReference(artifact, path);
  if (!ref) return null;
  if (ref.suffix.length === 0 && ref.kind === "node") {
    return nodeDimension(artifact, ref.nodeId);
  }
  const spec = fieldSpec(artifact, ref);
  return spec?.dimension ?? spec?.taxonomy ?? (spec?.type === "boolean" ? "boolean" : null);
}

function taxonomyOf(artifact, path) {
  const ref = resolveReference(artifact, path);
  if (!ref) return null;
  let taxonomy = null;
  if (ref.suffix.length === 0 && ref.kind === "node") {
    const node = artifact.nodes[ref.nodeId];
    taxonomy = node.kind === "choice" ? node.taxonomy : null;
  } else {
    taxonomy = fieldSpec(artifact, ref)?.taxonomy ?? null;
  }
  return taxonomy && artifact.taxonomies?.[taxonomy] ? taxonomy : null;
}

function unitSymbols(dimensionId) {
  const entry = UNIT_DIMENSIONS.find((dim) => dim.id === dimensionId);
  return new Map((entry?.units ?? []).map(([id, symbol]) => [symbol, id]));
}

function resolveUnit(artifact, dimensionId, spec) {
  const dim = artifact.dimensions?.[dimensionId];
  if (!dim) return null;
  const symbols = unitSymbols(dimensionId);
  for (const candidate of [spec.displayUnit, spec.unit]) {
    if (!candidate) continue;
    if (candidate === dim.base_unit || candidate in (dim.units ?? {})) return candidate;
    const bySymbol = symbols.get(candidate);
    if (bySymbol) return bySymbol;
  }
  const entry = UNIT_DIMENSIONS.find((d) => d.id === dimensionId);
  return entry?.default ?? dim.base_unit;
}

// Step rows carry readout labels the registry may not repeat ("− Grain
// absorption"), and table columns label a path per column. Registry labels win.
function collectStepLabels(node, labels, columns) {
  if (Array.isArray(node)) {
    for (const item of node) collectStepLabels(item, labels, columns);
    return;
  }
  if (!node || typeof node !== "object") return;
  if (typeof node.label === "string" && node.label !== "") {
    if (typeof node.value === "string") labels.set(node.value, node.label);
    if (typeof node.ref === "string") labels.set(node.ref, node.label);
  }
  if (Array.isArray(node.columns)) {
    for (const column of node.columns) {
      if (column && typeof column === "object" && column.id && column.label) {
        columns.set(column.id, column.label);
      }
    }
  }
  if (Array.isArray(node.rows) && Array.isArray(node.columns)) {
    for (const row of node.rows) {
      for (const column of node.columns) {
        if (!column || typeof column !== "object" || !column.id || !column.label) continue;
        const value = row?.[column.id];
        if (typeof value === "string" && !labels.has(value)) labels.set(value, column.label);
      }
    }
  }
  for (const value of Object.values(node)) {
    if (value && typeof value === "object") collectStepLabels(value, labels, columns);
  }
}

function resolvablePaths(artifact) {
  const paths = new Set();
  for (const [id, node] of Object.entries(artifact.nodes)) {
    paths.add(id);
    if (node.kind === "selection") {
      const schema = artifact.primitive_schemas?.[node.output?.schema] ?? {};
      for (const field of Object.keys(schema)) paths.add(`${id}.${field}`);
    }
    if (node.kind === "collection") {
      const schema = artifact.primitive_schemas?.[node.item_schema] ?? {};
      for (const field of Object.keys(schema)) paths.add(`${id}.${field}`);
    }
    if (node.kind === "boundary") {
      for (const output of Object.keys(node.outputs ?? {})) paths.add(`${id}.${output}`);
    }
  }
  for (const [namespace, schemaId] of Object.entries(artifact.identity ?? {})) {
    for (const field of Object.keys(artifact.primitive_schemas?.[schemaId] ?? {})) {
      paths.add(`${namespace}.${field}`);
    }
  }
  return [...paths].sort();
}

// AI AGENT HOOKS: Use this builder for the report bundle's catalog block. It is
// presentation metadata only; never feed it back into the artifact or engine.
export function buildReportCatalog(artifact) {
  const stepLabels = new Map();
  collectStepLabels(steps, stepLabels, new Map());

  const nodes = {};
  for (const path of resolvablePaths(artifact)) {
    const spec = registry[path] ?? {};
    const dimension = dimensionOf(artifact, path);
    const taxonomy = taxonomyOf(artifact, path);
    const unit = dimension ? resolveUnit(artifact, dimension, spec) : null;
    nodes[path] = {
      label: spec.label ?? stepLabels.get(path) ?? ionLabel(path) ?? humanize(path),
      dimension: dimension && artifact.dimensions?.[dimension] ? dimension : null,
      unit,
      decimals: spec.decimals ?? (dimension ? unitDecimals(dimension, unit) : null),
      step: spec.step ?? null,
      options: taxonomy ? [...artifact.taxonomies[taxonomy]] : null,
      option_labels: spec.optionLabels ?? null,
    };
  }

  return { dimensions: artifact.dimensions, nodes };
}
