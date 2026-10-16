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
import { UNIT_DIMENSIONS, UNIT_SYMBOLS, unitDecimals } from "./registry/units.js";

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

function formatValue(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : String(Math.round(value * 1000) / 1000);
  }
  return String(value);
}

// Resolve a table cell's display: convert a numeric value through its dimension's
// inherited unit (master pick → dimension default → base) and pair it with the
// unit symbol. Non-numeric values pass through as plain text; unknown dimensions
// (e.g. dimensionless) render raw.
function cellDisplay(artifact, dimension, value, unitMode, nl) {
  if (typeof value !== "number" || !dimension) return { display: formatValue(value), unit: null };
  const dimDef = UNIT_DIMENSIONS.find((d) => d.id === dimension);
  if (!dimDef) return { display: formatValue(value), unit: null };
  const unitId = unitMode[dimension] ?? dimDef.default ?? dimDef.units[0][0];
  const shown = fromBase(artifact, dimension, unitId, value, nl);
  const decimals = unitDecimals(dimension, unitId);
  const display = decimals != null ? shown.toFixed(decimals) : formatValue(shown);
  const symbol = UNIT_SYMBOLS[dimension]?.[unitId] ?? unitId;
  return { display, unit: symbol };
}

// Valuate a readout-table field: resolve each row's value cells against the
// engine, convert numerics through their dimension, and surface optional static
// hints and conditional notes (shown only when positive).
function valuateTable(field, artifact, engine, unitMode, nl) {
  const rows = field.rows.map((row) => {
    const cells = {};
    for (const col of field.columns) {
      if (col.kind === "text") {
        cells[col.id] = row[col.id] != null ? { text: String(row[col.id]) } : { text: "" };
        continue;
      }
      const ref = row[col.id];
      if (!ref) {
        cells[col.id] = null;
        continue;
      }
      let value;
      try {
        value = engine.resolve(ref);
      } catch {
        cells[col.id] = null;
        continue;
      }
      if (typeof value !== "number") {
        cells[col.id] = { text: formatValue(value) };
        continue;
      }
      let dimension = null;
      try {
        dimension = describe(artifact, ref).dimension;
      } catch {
        dimension = null;
      }
      const d = cellDisplay(artifact, dimension, value, unitMode, nl);
      cells[col.id] = { display: d.display, unit: d.unit };
    }
    let note = null;
    if (row.note) {
      let value;
      try {
        value = engine.resolve(row.note.ref);
      } catch {
        value = null;
      }
      if (typeof value === "number") {
        let dimension = null;
        try {
          dimension = describe(artifact, row.note.ref).dimension;
        } catch {
          dimension = null;
        }
        const d = cellDisplay(artifact, dimension, value, unitMode, nl);
        note = { show: value > 0, label: row.note.label ?? "", display: d.display, unit: d.unit };
      }
    }
    return {
      cells,
      hint: row.hint != null ? String(row.hint) : null,
      note,
      bold: !!row.bold,
    };
  });
  return { ...field, rows };
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
            // Round/format displayed numbers so converted values don't leak
            // float fuzz (e.g. 80.00000000000001); honor a column `decimals`.
            if (typeof out[col.id] === "number") {
              out[col.id] =
                col.decimals != null
                  ? out[col.id].toFixed(col.decimals)
                  : Math.round(out[col.id] * 1000) / 1000;
            }
          }
          return out;
        });
        return { ...field, rows: displayRows, rowValidations: displayRows.map((_, i) => collectionDomains[field.id]?.[i] ?? {}) };
      }
      if (field.control === "readout-table") {
        return valuateTable(field, artifact, engine, unitMode, nl);
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
      // Display-only unit resolution (the base value stays canonical). A
      // registry `displayUnit` is a PIN — the field's preferred unit (e.g. salt
      // in g) that the master menu must not override. Precedence:
      //   per-field override → pin (displayUnit) → master (menu) → base unit.
      const dimDef = toggleable ? UNIT_DIMENSIONS.find((d) => d.id === field.dimension) : null;
      const baseUnitId = dimDef?.units[0]?.[0] ?? null;
      // Inherited unit = pin → master pick → dimension's preferred default (e.g.
      // color defaults to EBC, matching the legacy metric default) → base.
      const inheritedUnitId = toggleable
        ? field.displayUnit ?? unitMode[field.dimension] ?? dimDef?.default ?? null
        : null;
      const unitId = toggleable ? unitMode[field.id] ?? inheritedUnitId : null;
      const shown =
        unitId && typeof value === "number" && artifact
          ? fromBase(artifact, field.dimension, unitId, value, nl)
          : value;
      const symbol = unitId ? UNIT_SYMBOLS[field.dimension]?.[unitId] ?? unitId : null;
      // A toggleable field with no unit id and no registry `unit` (e.g.
      // equipment conversion efficiency) still needs a pill label — fall back to
      // the dimension's base-unit symbol (so a fraction reads "×1", not blank).
      const fallbackSymbol =
        !symbol && toggleable ? UNIT_SYMBOLS[field.dimension]?.[baseUnitId] ?? null : null;
      // Display precision: registry override → unit-level → dimension fallback.
      // A null `unitId` (no preference set) still displays the base unit, so
      // resolve precision against the effective unit the value is shown in.
      const decimals = field.decimals ?? unitDecimals(field.dimension, unitId ?? baseUnitId);
      const display =
        decimals != null && typeof shown === "number" ? shown.toFixed(decimals) : formatValue(shown);
      const out = {
        ...field,
        value,
        unit: symbol ?? field.unit ?? fallbackSymbol,
        display,
        toggleable,
        unitId,
        // Accented ONLY on a deliberate per-field deviation from the inherited
        // unit (a pill override); master-following and pinned fields never are.
        customized: toggleable && unitId !== inheritedUnitId,
      };
      // Per-field domain state of the selected component (e.g. an equipment
      // constant), for inline surfacing.
      const ref = resolveReference(artifact, field.id);
      const vkey = ref ? (ref.suffix.length ? `${ref.nodeId}.${ref.suffix.join(".")}` : ref.nodeId) : null;
      out.validation = (vkey && fieldDomains[vkey]) || null;
      // The intensive-value input is polymorphic across topologies: a mash
      // thickness (L/kg) under `r_l_to_g`, a dimensionless runoff ratio under
      // `runoff_ratio`. The artifact pins its dimension to mash_thickness, so
      // the ratio mode is handled host-side (no conversion, no unit badge).
      if (field.id === "batch.intensive_value") {
        if (engine.get("batch.topology") === "runoff_ratio") {
          out.label = "Runoff Ratio r";
          out.dimension = null;
          out.unit = null;
          out.unitId = null;
          out.toggleable = false;
          out.customized = false;
          out.display = formatValue(out.value);
          out.hint = "V_run1 / V_run2; 1.0 is equal runnings.";
        } else {
          out.label = "Liquor-to-Grist Ratio";
          out.hint = "Strike water per kg of grist.";
        }
      }
      // Surface the solver's ABV ceiling under the target-ABV input (mirrors the
      // legacy "Max at current attenuation" hint).
      if (field.id === "batch.target_abv") {
        let max;
        try {
          max = engine.resolve("solver.batch.max_achievable_abv");
        } catch {
          max = null;
        }
        if (typeof max === "number" && Number.isFinite(max)) {
          out.hint = `Max at current attenuation: ${max.toFixed(1)}%.`;
        }
      }
      return out;
    })
    .filter(Boolean);
}

export function produce(artifact, steps, registry, engine, ctx = {}) {
  return valuate(projectFields(artifact, steps, registry, ctx), engine, { ...ctx, artifact });
}
