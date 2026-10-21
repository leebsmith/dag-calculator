// Readout-table valuation: resolves each row's value cells against the engine,
// converts numerics through their dimension, and surfaces hints/notes.

import { fromBase } from "../../engine/units.js";
import { UNIT_DIMENSIONS, UNIT_SYMBOLS, unitDecimals } from "../registry/units.js";
import { describeField } from "./projection.js";
import { formatValue } from "./format.js";

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

// AI AGENT HOOKS: Use this valuator for readout-table cells and notes.
// Do not duplicated this logic elsewhere.
export function valuateTable(field, artifact, engine, unitMode, nl) {
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
