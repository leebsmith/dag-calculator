// Readout-table valuation: resolves each row's value cells against the engine,
// converts numerics through their dimension, and surfaces hints/notes.

import { fromBase } from "../../engine/units.js";
import { UNIT_DIMENSIONS, UNIT_SYMBOLS, unitDecimals } from "../registry/units.js";
import { unitSymbol } from "../../utils.js";
import { describeField } from "./projection.js";
import { formatCell } from "./cell.js";
import { reportError } from "../../observability.js";

// Display markers for an ingredient figure. The number itself never changes:
//   ~  assumed prior (no published figure)
//   ≥  published minimum — a floor, not a point estimate
//   ≈  converted from an apparent attenuation at the fixed 12 °P reference
const FIGURE_COLUMNS = {
  fermentability_fraction: {
    provenance: "fermentability_provenance",
    apparent: (row) => row.fermentability_basis === "apparent",
  },
  yield_fraction: { provenance: "yield_provenance", apparent: () => false },
};

export function figureMarker(provenance, { apparent = false } = {}) {
  const marks = [];
  if (provenance?.kind === "prior") marks.push("~");
  if (provenance?.bound === "min") marks.push("≥");
  if (apparent) marks.push("≈");
  return marks.join("");
}

export function figureMarkFor(columnId, row) {
  const figure = FIGURE_COLUMNS[columnId];
  if (!figure || !row) return "";
  return figureMarker(row[figure.provenance], { apparent: figure.apparent(row) });
}

function cellDisplay(artifact, dimension, value, unitMode, nl, meta = {}) {
  if (typeof value !== "number" || !dimension) return formatCell(value);
  const dimDef = UNIT_DIMENSIONS.find((d) => d.id === dimension);
  const unitId = dimDef
    ? meta.displayUnit ?? unitMode[dimension] ?? dimDef.default ?? dimDef.units[0][0]
    : null;
  const shown = dimDef && unitId ? fromBase(artifact, dimension, unitId, value, nl) : value;
  const decimals = meta.decimals ?? unitDecimals(dimension, unitId);
  const symbol = dimDef ? unitSymbol(UNIT_SYMBOLS, dimension, unitId) : meta.unit ?? null;
  return formatCell(shown, { decimals, symbol });
}

// AI AGENT HOOKS: Use this valuator for readout-table cells and notes.
// Do not duplicated this logic elsewhere.
export function valuateTable(field, artifact, engine, unitMode, nl, registry = {}) {
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
      } catch (err) {
        reportError("producer.table.value", err);
        cells[col.id] = null;
        continue;
      }
      if (typeof value !== "number") {
        cells[col.id] = { text: formatCell(value).display };
        continue;
      }
      let dimension = null;
      try {
        dimension = describeField(artifact, ref).dimension;
      } catch (err) {
        reportError("producer.table.dimension", err);
        dimension = null;
      }
      const d = cellDisplay(artifact, dimension, value, unitMode, nl, registry[ref] ?? {});
      const mark = figureMarkFor(col.id, row);
      cells[col.id] = mark
        ? { display: `${mark}${d.display}`, unit: d.unit }
        : { display: d.display, unit: d.unit };
    }
    let note = null;
    if (row.note) {
      let value;
      try {
        value = engine.resolve(row.note.ref);
      } catch (err) {
        reportError("producer.table.note", err);
        value = null;
      }
      if (typeof value === "number") {
        let dimension = null;
        try {
          dimension = describeField(artifact, row.note.ref).dimension;
        } catch (err) {
          reportError("producer.table.noteDimension", err);
          dimension = null;
        }
        const d = cellDisplay(
          artifact,
          dimension,
          value,
          unitMode,
          nl,
          registry[row.note.ref] ?? {}
        );
        note = { show: value > 0, label: row.note.label ?? "", display: d.display, unit: d.unit };
      }
    }
    return {
      cells,
      hint: row.hint != null ? String(row.hint) : null,
      note,
      bold: !!row.bold,
      subtract: row.subtract === true,
    };
  });
  return { ...field, rows };
}
