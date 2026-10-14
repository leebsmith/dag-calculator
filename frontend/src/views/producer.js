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
  const columns = (entry.columns ?? Object.keys(schema)).map((c) => {
    const spec = schema[c] ?? {};
    const meta = registry[`${entry.collection}.${c}`] ?? {};
    return {
      id: c,
      label: meta.label ?? c,
      dimension: spec.dimension ?? null,
      displayUnit: meta.displayUnit ?? null,
    };
  });
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

export function nonlinearFns(artifact, engine) {
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
  const fieldDomains = ctx.fieldDomains ?? {};
  const collectionDomains = ctx.collectionDomains ?? {};
  const nl = nonlinearFns(artifact, engine);
  const toggleableDims = new Set(UNIT_DIMENSIONS.map((d) => d.id));
  return fields
    .map((field) => {
      // Empty-selection guard: selection-derived fields are deferred until the
      // reference root names a real component (default "" is "none chosen").
      if (field.selectionRef && engine.get(field.selectionRef) === "") return null;
      if (field.control === "collection-table") {
        // Display-only column conversion: a column with a registry `displayUnit`
        // renders in that unit; the canonical value stays base in the engine.
        const rows = (engine.get(field.id) ?? []).map((r) => ({ ...r }));
        const displayRows = rows.map((row) => {
          const out = { ...row };
          for (const col of field.columns) {
            if (col.displayUnit && col.dimension && typeof row[col.id] === "number") {
              out[col.id] = fromBase(artifact, col.dimension, col.displayUnit, row[col.id], nl);
            }
          }
          return out;
        });
        return { ...field, rows: displayRows, rowValidations: displayRows.map((_, i) => collectionDomains[field.id]?.[i] ?? {}) };
      }
      // A field whose value cannot be resolved (e.g. a boundary that has not
      // been pre-resolved or failed) is deferred rather than crashing the view.
      let value;
      try {
        value = engine.resolve(field.id);
      } catch {
        return null;
      }
      const toggleable = Boolean(field.dimension && toggleableDims.has(field.dimension));
      // Display-only unit conversion (readouts): base value stays canonical.
      // A per-field override wins over the per-dimension default, which wins
      // over the registry's preferred display unit.
      const unitId = toggleable
        ? unitMode[field.id] ?? unitMode[field.dimension] ?? field.displayUnit ?? null
        : null;
      // The field's natural default (no overrides): the registry's preferred
      // display unit, else the dimension's base unit. Used to decide whether the
      // pill is showing a non-default unit.
      const naturalUnitId = toggleable
        ? field.displayUnit ?? UNIT_DIMENSIONS.find((d) => d.id === field.dimension)?.units[0]?.[0] ?? null
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
        // Accented when the pill shows something the user wouldn't get by
        // default: either a per-field toggle is in play, or the effective unit
        // differs from the field's natural default (e.g. a Units-menu pick).
        customized:
          toggleable &&
          (Object.prototype.hasOwnProperty.call(unitMode, field.id) ||
            (unitId !== null && unitId !== naturalUnitId)),
      };
      // Per-field domain state of the selected component (e.g. an equipment
      // constant), for inline surfacing.
      const ref = resolveReference(artifact, field.id);
      const vkey = ref ? (ref.suffix.length ? `${ref.nodeId}.${ref.suffix.join(".")}` : ref.nodeId) : null;
      out.validation = (vkey && fieldDomains[vkey]) || null;
      // Apparent attenuation is bounded by the selected strain; expose the
      // valid range so the batch card can show it (the adapter clamps to it).
      if (field.id === "batch.apparent_attenuation") {
        const low = engine.get("batch.yeast_id") ? engine.resolve("batch.yeast.low_attenuation") : undefined;
        const high = engine.get("batch.yeast_id") ? engine.resolve("batch.yeast.high_attenuation") : undefined;
        if (typeof low === "number" && typeof high === "number") {
          const conv = (v) => (unitId && artifact ? fromBase(artifact, field.dimension, unitId, v, nl) : v);
          out.rangeHint = `${formatValue(conv(low))}–${formatValue(conv(high))}${symbol ?? ""}`;
        }
      }
      return out;
    })
    .filter(Boolean);
}

export function produce(artifact, steps, registry, engine, ctx = {}) {
  return valuate(projectFields(artifact, steps, registry, ctx), engine, { ...ctx, artifact });
}
