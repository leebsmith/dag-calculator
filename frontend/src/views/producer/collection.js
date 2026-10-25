// Collection-table valuation: display-only column conversion plus per-row
// validation state.

import { fromBase } from "../../engine/units.js";

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
      // Round/format displayed numbers so converted values don't leak float
      // fuzz (e.g. 80.00000000000001); honor a column `decimals`. Editable inputs
      // override this with their raw draft text while focused.
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
