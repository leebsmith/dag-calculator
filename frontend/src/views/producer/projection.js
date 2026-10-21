// Static field projection: declares what fields exist for each step, their
// controls, dimensions, options, and write targets. Pure and DOM-free.

import { resolveReference } from "../../engine/paths.js";
import { fromBase } from "../../engine/units.js";
import { rendererFor } from "../renderers.js";
import { UNIT_DIMENSIONS, UNIT_SYMBOLS, unitDecimals } from "../registry/units.js";

function defaultControl(node) {
  if (node.kind === "root" && node.dimension === "reference") return "selection-picker";
  if (node.kind === "root") return "number";
  if (node.kind === "choice") return "choice-select";
  return "readout";
}

export function describeField(artifact, id) {
  const node = artifact.nodes[id];
  if (node) {
    if (node.kind === "root" && node.dimension === "reference") {
      return { kind: "reference", isInput: true, node, dimension: "reference", taxonomy: null };
    }
    if (node.kind === "derived") {
      return {
        kind: "derived",
        isInput: false,
        node,
        dimension: node.output?.dimension ?? null,
        taxonomy: node.output?.taxonomy ?? null,
      };
    }
    return {
      kind: node.kind,
      isInput: node.kind === "root" || node.kind === "choice",
      node,
      dimension: node.dimension ?? null,
      taxonomy: node.taxonomy ?? null,
    };
  }
  const ref = resolveReference(artifact, id);
  if (!ref) throw new Error(`Manifest references unknown node/field "${id}"`);
  const owner = artifact.nodes[ref.nodeId];
  const suffix = ref.suffix.join(".");
  if (owner?.kind === "boundary") {
    const spec = owner.outputs?.[suffix];
    return {
      kind: "path",
      isInput: false,
      node: owner,
      dimension: spec?.dimension ?? null,
      taxonomy: spec?.taxonomy ?? null,
    };
  }
  if (owner?.kind === "selection") {
    const fieldSpec = artifact.primitive_schemas[owner.schema]?.[ref.suffix[0]] ?? {};
    return {
      kind: "path",
      isInput: false,
      node: owner,
      dimension: fieldSpec.dimension ?? null,
      taxonomy: fieldSpec.taxonomy ?? null,
      selectionRef: owner.ref,
    };
  }
  throw new Error(`Unsupported reference "${id}"`);
}

function dimensionDefaultUnit(dimensionId) {
  return UNIT_DIMENSIONS.find((d) => d.id === dimensionId)?.default ?? null;
}

// Resolve a collection's display columns. Shared by the producer's engine-backed
// collection field AND the draft editors, so header units / cell conversion are
// single-sourced. Unit precedence mirrors scalar fields:
//   registry pin → master (menu) → dimension default → base.
// `displayUnit` is the effective unit used for value conversion; `unit` is the
// symbol shown in the header (falls back to the base symbol).
export function resolveCollectionColumns(artifact, registry, collectionId, entry = {}, unitMode = {}) {
  const node = artifact.nodes[collectionId];
  if (!node || node.kind !== "collection") {
    throw new Error(`Unknown collection "${collectionId}"`);
  }
  const schema = artifact.primitive_schemas[node.item_schema] ?? {};
  const inputs = entry.inputs ? new Set(entry.inputs) : null;
  return (entry.columns ?? Object.keys(schema)).map((c) => {
    const spec = schema[c] ?? {};
    const meta = registry[`${collectionId}.${c}`] ?? {};
    const dimDef = spec.dimension ? UNIT_DIMENSIONS.find((d) => d.id === spec.dimension) : null;
    const unitId = spec.dimension
      ? meta.displayUnit ?? unitMode[spec.dimension] ?? dimensionDefaultUnit(spec.dimension) ?? null
      : null;
    const shownUnitId = unitId ?? dimDef?.units?.[0]?.[0] ?? null;
    return {
      id: c,
      label: meta.label ?? c,
      dimension: spec.dimension ?? null,
      displayUnit: unitId,
      unit: shownUnitId ? UNIT_SYMBOLS[spec.dimension]?.[shownUnitId] ?? shownUnitId : null,
      decimals: meta.decimals ?? unitDecimals(spec.dimension, shownUnitId),
      editable: inputs ? inputs.has(c) : true,
    };
  });
}

// Read-side display conversion (base → display unit) for a single value. Lives
// here (with the producer) so `fromBase` stays single-sourced; drafts call it too.
export function displayValue(artifact, dimensionId, unitId, value, nonlinearFns = {}) {
  if (!dimensionId || !unitId || typeof value !== "number") return value;
  return fromBase(artifact, dimensionId, unitId, value, nonlinearFns);
}

function collectionField(artifact, registry, step, entry, unitMode = {}) {
  const columns = resolveCollectionColumns(artifact, registry, entry.collection, entry, unitMode);
  return {
    id: entry.collection,
    slice: step.slice,
    role: "input",
    control: "collection-table",
    label: registry[entry.collection]?.label ?? entry.collection,
    unit: null,
    columns,
    editable: true,
    // Optional bespoke add-row flow (e.g. open a catalog picker modal).
    addAction: entry.addAction ?? null,
    addLabel: entry.addLabel ?? "Add row",
    target: { scope: "collection", nodeId: entry.collection },
  };
}

// A readout table: a grouped, non-editable display of labeled scalar readouts
// (the batch card's "Derived Anchors" / "Stage Cascade" / "Water Plan" tables).
// Columns are either `text` (static per-row label) or `value` (a ref resolved at
// valuation time). Cell dimensions are carried by each ref, not the column.
function tableField(step, entry) {
  return {
    id: entry.table,
    slice: step.slice,
    role: "readout",
    control: "readout-table",
    title: entry.title ?? entry.table,
    header: entry.columns.length > 2,
    columns: entry.columns.map((c) => ({
      id: c.id,
      label: c.label ?? c.id,
      kind: c.kind ?? "value",
      align: (c.kind ?? "value") === "text" ? "left" : "right",
    })),
    rows: entry.rows,
    editable: false,
  };
}

// A reference root (dimension "reference") names the selection node whose
// `ref` points back at it. That selection's schema keys the reference set.
function referenceSchema(artifact, rootId) {
  for (const node of Object.values(artifact.nodes)) {
    if (node.kind === "selection" && node.ref === rootId) return node.schema;
  }
  return null;
}

// AI AGENT HOOKS: Use this projection entry point for declaring step fields.
// Do not duplicated this logic elsewhere.
export function projectFields(artifact, steps, registry, ctx = {}) {
  const unitMode = ctx.ui?.unitMode ?? {};
  const fields = [];
  for (const step of steps) {
    for (const entry of step.fields) {
      if (typeof entry === "object" && entry.collection) {
        fields.push(collectionField(artifact, registry, step, entry, unitMode));
        continue;
      }
      if (typeof entry === "object" && entry.table) {
        fields.push(tableField(step, entry));
        continue;
      }
      const id = typeof entry === "string" ? entry : entry.id;
      const info = describeField(artifact, id);
      const meta = registry[id] ?? {};
      const role = (typeof entry === "object" && entry.role) || (info.isInput ? "input" : "readout");
      let control = (typeof entry === "object" && entry.control) || meta.control;
      if (!control) {
        if (info.isInput) control = defaultControl(info.node);
        else control = "readout";
      }
      const editable = role === "input" && rendererFor(control).editable;

      let target = null;
      if (editable) {
        target = { scope: info.kind === "reference" ? "root" : info.kind, nodeId: id };
      }
      const options =
        info.kind === "choice"
          ? artifact.taxonomies[info.taxonomy]
          : info.kind === "reference"
            ? Object.keys(ctx.references?.[referenceSchema(artifact, id)] ?? {})
            : null;

      fields.push({
        id,
        slice: step.slice,
        role,
        control,
        dimension: info.dimension ?? info.taxonomy ?? null,
        label: meta.label ?? id,
        unit: meta.unit ?? null,
        displayUnit: meta.displayUnit ?? null,
        decimals: meta.decimals ?? null,
        hint: meta.hint ?? null,
        options,
        editable,
        target,
        ...(info.selectionRef ? { selectionRef: info.selectionRef } : {}),
      });
    }
  }
  return fields;
}
