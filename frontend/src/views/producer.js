// Field-model producer — the ONLY view module that reads the engine. Pure and
// DOM-free: a static projection (what fields exist) + dynamic valuation (their
// current values), with write targets unifying all edits under single-writer.
//
// A field `id` is either a node id (root/choice/derived) or a dotted reference
// path (a boundary output like `solver.batch.m_grist`, or a selection field like
// `equipment.mash_tun_mass_kg`). Valuation uses `engine.resolve`, which handles
// both uniformly.
import { resolveReference } from "../engine/paths.js";
import { rendererFor } from "./renderers.js";

function defaultControl(node) {
  if (node.kind === "root") return "number";
  if (node.kind === "choice") return "choice-select";
  return "readout";
}

// Describe a field id: a declared node, or a resolvable dotted reference path.
function describe(artifact, id) {
  const node = artifact.nodes[id];
  if (node) {
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
  const spec = owner?.kind === "boundary" ? owner.outputs?.[suffix] : undefined;
  return {
    kind: "path",
    isInput: false,
    node: owner,
    dimension: spec?.dimension ?? null,
    taxonomy: spec?.taxonomy ?? null,
  };
}

// Static projection: one descriptor per declared field. No values.
export function projectFields(artifact, steps, registry) {
  const fields = [];
  for (const step of steps) {
    for (const entry of step.fields) {
      const id = typeof entry === "string" ? entry : entry.id;
      const info = describe(artifact, id);
      const meta = registry[id] ?? {};
      const role = (typeof entry === "object" && entry.role) || (info.isInput ? "input" : "readout");
      const control =
        (typeof entry === "object" && entry.control) ||
        meta.control ||
        (info.isInput ? defaultControl(info.node) : "readout");
      const editable = role === "input" && rendererFor(control).editable;
      fields.push({
        id,
        slice: step.slice,
        role,
        control,
        dimension: info.dimension ?? info.taxonomy ?? null,
        label: meta.label ?? id,
        unit: meta.unit ?? null,
        options: info.kind === "choice" ? artifact.taxonomies[info.taxonomy] : null,
        editable,
        target: editable ? { scope: info.kind, nodeId: id } : null,
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

// Dynamic valuation: attach current value + display string for each field.
export function valuate(fields, engine) {
  return fields.map((field) => {
    const value = engine.resolve(field.id);
    return { ...field, value, display: formatValue(value) };
  });
}

export function produce(artifact, steps, registry, engine) {
  return valuate(projectFields(artifact, steps, registry), engine);
}
