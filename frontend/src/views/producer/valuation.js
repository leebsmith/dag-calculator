// Dynamic valuation: resolves each projected field against the engine, applies
// display units, validation, conformance, provenance, and presentation rules.

import { resolveReference } from "../../engine/paths.js";
import { fromBase } from "../../engine/units.js";
import { UNIT_DIMENSIONS, UNIT_SYMBOLS, unitDecimals } from "../registry/units.js";
import { seedDerivations, approxEqual, sourceLabel } from "../seedDerivations.js";
import { CONFORMANCE_FIELD_MAP, applyPresentation, presentationFor } from "../registry/presentation.js";
import { describeField, projectFields } from "./projection.js";

function conformanceHint(c) {
  if (!c || !c.violatedBoundary) return null;
  const dir = c.violatedBoundary === c.high ? "Above" : "Below";
  const tier =
    c.status === "severe" ? "far out of style" : c.status === "drift" ? "out of style" : "near style limit";
  return `${dir} style limit ${Number(c.violatedBoundary.toFixed(3))} (${tier})`;
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
        dimension = describeField(artifact, ref).dimension;
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
          dimension = describeField(artifact, row.note.ref).dimension;
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
        return {
          ...field,
          rows: displayRows,
          rowValidations: displayRows.map((_, i) => collectionDomains[field.id]?.[i] ?? {}),
        };
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
      // Editable number inputs render their natural value (no fixed-decimal
      // padding) so a debounced re-render never rewrites "6" into "6.0" while
      // the user is mid-keystroke. Readouts keep their pinned precision.
      const display =
        field.control !== "number" && decimals != null && typeof shown === "number"
          ? shown.toFixed(decimals)
          : formatValue(shown);
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
      const conformanceKey = CONFORMANCE_FIELD_MAP[field.id];
      if (conformanceKey && ctx.conformance?.dimensions) {
        out.conformance = ctx.conformance.dimensions[conformanceKey] ?? null;
        out.conformanceHint = conformanceHint(out.conformance);
      }
      // Host-side presentation overrides (polymorphic labels/units, solver
      // hints). The artifact stays the sole owner of value semantics.
      const presentation = presentationFor(field.id);
      if (presentation) {
        applyPresentation(
          out,
          presentation,
          { get: (id) => engine.get(id), resolve: (path) => engine.resolve(path) },
          formatValue
        );
      }
      // Seed provenance: is this root's value currently equal to a seed-derived
      // source (a water report ion, a yeast/style copy-in)? Carries the source
      // value + label for the "reset to source" affordance.
      const sources = seedDerivations(field.id);
      if (sources.length) {
        let seeded = false;
        let seededValue;
        let seededSource = "";
        for (const src of sources) {
          let component;
          try {
            component = engine.get(src.selection);
          } catch {
            component = null;
          }
          const derived = src.derive(component);
          if (derived === undefined) continue;
          if (seededValue === undefined) {
            seededValue = derived;
            seededSource = sourceLabel(component);
          }
          if (value !== undefined && approxEqual(derived, value)) {
            seeded = true;
            seededValue = derived;
            seededSource = sourceLabel(component);
          }
        }
        out.seeded = seeded;
        out.seededValue = seededValue;
        out.seededSource = seededSource;
      }
      return out;
    })
    .filter(Boolean);
}

export function produce(artifact, steps, registry, engine, ctx = {}) {
  return valuate(projectFields(artifact, steps, registry, ctx), engine, { ...ctx, artifact });
}
