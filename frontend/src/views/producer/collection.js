// Collection-table valuation: display-only column conversion plus per-row
// validation state.

import { fromBase } from "../../engine/units.js";
import { figureMarkFor } from "./table.js";
import { formatCell } from "./cell.js";

// AI AGENT HOOKS: Use this valuator for collection-table display conversion.
// Do not duplicated this logic elsewhere.
export function valuateCollection(field, engine, artifact, collectionDomains, nl) {
  const rows = (engine.get(field.id) ?? []).map((r) => ({ ...r }));
  const displayRows = rows.map((row) => {
    const out = { ...row };
    for (const col of field.columns) {
      if (col.displayUnit && col.dimension && typeof row[col.id] === "number") {
        out[col.id] = fromBase(artifact, col.dimension, col.displayUnit, row[col.id], nl);
      }
      // Converted values can carry float fuzz (e.g. 80.00000000000001), so every
      // numeric cell goes through the one display rule; a column `decimals` pins
      // it, otherwise it trims. Editable inputs keep their raw draft text while
      // focused.
      if (typeof out[col.id] === "number") {
        out[col.id] = formatCell(out[col.id], { decimals: col.decimals }).display;
      }
      const mark = figureMarkFor(col.id, row);
      if (mark && typeof row[col.id] === "number") {
        out[col.id] = `${mark}${out[col.id]}`;
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
