// Field-model producer — the ONLY view module that reads the engine. Pure and
// DOM-free: a static projection (what fields exist) + dynamic valuation (their
// current values), with write targets unifying all edits under single-writer.
//
// A field `id` is a node id (root/choice/derived), a dotted reference path
// (boundary output / selection field), or a `{ collection }` entry. Valuation
// uses `engine.resolve`, which handles nodes and dotted paths uniformly.
import { resolveReference } from "../engine/paths.js";
import { fromBase } from "../engine/units.js";
import { rendererFor } from "./renderers.js";
import { UNIT_DIMENSIONS, UNIT_SYMBOLS } from "./registry/units.js";

function defaultControl(node) {
  if (node.kind === "root" && node.dimension === "reference") return "selection-picker";
  if (node.kind === "root") return "number";
  if (node.kind === "choice") return "choice-select";
  return "readout";
}

function describe(artifact, id) {
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
    return { kind: "path", isInput: false, node: owner, dimension: spec?.dimension ?? null, taxonomy: spec?.taxonomy ?? null };
  }
  if (owner?.kind === "selection") {
    const fieldSpec = artifact.primitive_schemas[owner.schema]?.[ref.suffix[0]] ?? {};
    if (fieldSpec.overridable) {
      return {
        kind: "overlay",
        isInput: true,
        node: owner,
        selectionNodeId: ref.nodeId,
        field: suffix,
        dimension: fieldSpec.dimension ?? null,
        taxonomy: fieldSpec.taxonomy ?? null,
        selectionRef: owner.ref,
      };
    }
    return { kind: "path", isInput: false, node: owner, dimension: fieldSpec.dimension ?? null, taxonomy: fieldSpec.taxonomy ?? null, selectionRef: owner.ref };
  }
  throw new Error(`Unsupported reference "${id}"`);
}

function collectionField(artifact, registry, step, entry) {
  const node = artifact.nodes[entry.collection];
  if (!node || node.kind !== "collection") {
    throw new Error(`Unknown collection "${entry.collection}"`);
  }
  const schema = artifact.primitive_schemas[node.item_schema] ?? {};
  const columns = (entry.columns ?? Object.keys(schema)).map((c) => ({
    id: c,
    label: registry[`${entry.collection}.${c}`]?.label ?? c,
  }));
  return {
    id: entry.collection,
    slice: step.slice,
    role: "input",
    control: "collection-table",
    label: registry[entry.collection]?.label ?? entry.collection,
    unit: null,
    columns,
    editable: true,
    target: { scope: "collection", nodeId: entry.collection },
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

export function projectFields(artifact, steps, registry, ctx = {}) {
  const fields = [];
  for (const step of steps) {
    for (const entry of step.fields) {
      if (typeof entry === "object" && entry.collection) {
        fields.push(collectionField(artifact, registry, step, entry));
        continue;
      }
      const id = typeof entry === "string" ? entry : entry.id;
      const info = describe(artifact, id);
      const meta = registry[id] ?? {};
      const role = (typeof entry === "object" && entry.role) || (info.isInput ? "input" : "readout");
      let control = (typeof entry === "object" && entry.control) || meta.control;
      if (!control) {
        if (info.kind === "overlay") control = info.taxonomy ? "choice-select" : "number";
        else if (info.isInput) control = defaultControl(info.node);
        else control = "readout";
      }
      const editable = role === "input" && rendererFor(control).editable;

      let target = null;
      if (editable) {
        target =
          info.kind === "overlay"
            ? { scope: "overlay", selectionNodeId: info.selectionNodeId, field: info.field }
            : { scope: info.kind === "reference" ? "root" : info.kind, nodeId: id };
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
        options,
        editable,
        target,
        ...(info.selectionRef ? { selectionRef: info.selectionRef } : {}),
      });
    }
  }
  return fields;
}

function formatValue(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : String(Math.round(value * 1000) / 1000);
  }
  return String(value);
}

function nonlinearFns(artifact, engine) {
  const fns = {};
  for (const dim of Object.values(artifact.dimensions ?? {})) {
    if (dim.kind !== "nonlinear") continue;
    for (const unit of Object.values(dim.units ?? {})) {
      fns[unit.fwd] = (v) => engine.call(unit.fwd, [v]);
      fns[unit.inv] = (v) => engine.call(unit.inv, [v]);
    }
  }
  return fns;
}

export function valuate(fields, engine, ctx = {}) {
  const { ui, artifact } = ctx;
  const unitMode = ui?.unitMode ?? {};
  const nl = nonlinearFns(artifact, engine);
  const toggleableDims = new Set(UNIT_DIMENSIONS.map((d) => d.id));
  return fields
    .map((field) => {
      // Empty-selection guard: selection-derived fields are deferred until the
      // reference root names a real component (default "" is "none chosen").
      if (field.selectionRef && engine.get(field.selectionRef) === "") return null;
      if (field.control === "collection-table") {
        return { ...field, rows: (engine.get(field.id) ?? []).map((r) => ({ ...r })) };
      }
      const value = engine.resolve(field.id);
      const toggleable = Boolean(field.dimension && toggleableDims.has(field.dimension));
      // Display-only unit conversion (readouts): base value stays canonical.
      // A per-field override wins over the per-dimension default, which wins
      // over the registry's preferred display unit.
      const unitId = toggleable
        ? unitMode[field.id] ?? unitMode[field.dimension] ?? field.displayUnit ?? null
        : null;
      const shown =
        unitId && typeof value === "number" && artifact
          ? fromBase(artifact, field.dimension, unitId, value, nl)
          : value;
      const symbol = unitId ? UNIT_SYMBOLS[field.dimension]?.[unitId] ?? unitId : null;
      const out = {
        ...field,
        value,
        unit: symbol ?? field.unit,
        display: formatValue(shown),
        toggleable,
        unitId,
        customized: toggleable && Object.prototype.hasOwnProperty.call(unitMode, field.id),
      };
      if (field.target?.scope === "overlay") {
        const overlay = engine.getOverlay(field.target.selectionNodeId);
        out.overridden = Object.prototype.hasOwnProperty.call(overlay, field.target.field);
      }
      return out;
    })
    .filter(Boolean);
}

export function produce(artifact, steps, registry, engine, ctx = {}) {
  return valuate(projectFields(artifact, steps, registry, ctx), engine, { ...ctx, artifact });
}
