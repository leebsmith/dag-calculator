// Field-model producer — the ONLY view module that reads the engine. Pure and
// DOM-free: a static projection (what fields exist) + dynamic valuation (their
// current values), with write targets unifying all edits under single-writer.
import { rendererFor } from "./renderers.js";

function defaultControl(node) {
  if (node.kind === "root") return "number";
  if (node.kind === "choice") return "choice-select";
  return "readout";
}

// Static projection: one descriptor per declared field. No values.
export function projectFields(artifact, steps, registry) {
  const fields = [];
  for (const step of steps) {
    for (const entry of step.fields) {
      const id = typeof entry === "string" ? entry : entry.id;
      const node = artifact.nodes[id];
      if (!node) throw new Error(`Manifest references unknown node "${id}"`);
      const meta = registry[id] ?? {};
      const isInput = node.kind === "root" || node.kind === "choice";
      const role = (typeof entry === "object" && entry.role) || (isInput ? "input" : "readout");
      const control =
        (typeof entry === "object" && entry.control) || meta.control || defaultControl(node);
      const editable = role === "input" && rendererFor(control).editable;
      fields.push({
        id,
        slice: step.slice,
        role,
        control,
        dimension: node.dimension ?? node.taxonomy ?? null,
        label: meta.label ?? id,
        unit: meta.unit ?? null,
        editable,
        target: editable ? { scope: node.kind, nodeId: id } : null,
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
    const value = engine.get(field.id);
    return { ...field, value, display: formatValue(value) };
  });
}

export function produce(artifact, steps, registry, engine) {
  return valuate(projectFields(artifact, steps, registry), engine);
}
