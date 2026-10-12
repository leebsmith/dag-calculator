// Field-model producer — the ONLY view module that reads the engine. Pure and
// DOM-free: a static projection (what fields exist) + dynamic valuation (their
// current values), with write targets unifying all edits under single-writer.
//
// A field `id` is a node id (root/choice/derived), a dotted reference path
// (boundary output / selection field), or a `{ collection }` entry. Valuation
// uses `engine.resolve`, which handles nodes and dotted paths uniformly.
import { resolveReference } from "../engine/paths.js";
import { rendererFor } from "./renderers.js";

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
      };
    }
    return { kind: "path", isInput: false, node: owner, dimension: fieldSpec.dimension ?? null, taxonomy: fieldSpec.taxonomy ?? null };
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
            ? Object.keys(ctx.references ?? {})
            : null;

      fields.push({
        id,
        slice: step.slice,
        role,
        control,
        dimension: info.dimension ?? info.taxonomy ?? null,
        label: meta.label ?? id,
        unit: meta.unit ?? null,
        options,
        editable,
        target,
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

export function valuate(fields, engine) {
  return fields.map((field) => {
    if (field.control === "collection-table") {
      return { ...field, rows: (engine.get(field.id) ?? []).map((r) => ({ ...r })) };
    }
    const value = engine.resolve(field.id);
    const out = { ...field, value, display: formatValue(value) };
    if (field.target?.scope === "overlay") {
      const overlay = engine.getOverlay(field.target.selectionNodeId);
      out.overridden = Object.prototype.hasOwnProperty.call(overlay, field.target.field);
    }
    return out;
  });
}

export function produce(artifact, steps, registry, engine, ctx = {}) {
  return valuate(projectFields(artifact, steps, registry, ctx), engine);
}
