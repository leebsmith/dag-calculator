// Freeze-time display strings for the report bundle. This is the only place a
// report value is converted, rounded, or given a unit symbol: it uses the same
// producer formatting as the UI and the catalog's unit-aware presentation, so
// the Typst generator never does conversion math.

import { resolveReference } from "../../engine/paths.js";
import { displayValue, nonlinearFns } from "../producer.js";
import { formatValue } from "../../utils.js";
import { reportError } from "../../observability.js";

// Collection fields are row values, not scalars: the catalog lists them for a
// report that indexes a row, but there is no single value to format.
function isCollectionField(artifact, path) {
  const ref = resolveReference(artifact, path);
  if (!ref || ref.kind !== "node" || ref.suffix.length === 0) return false;
  return artifact.nodes?.[ref.nodeId]?.kind === "collection";
}

export function buildReportFormatted(artifact, catalog, engine) {
  const nl = nonlinearFns(artifact, engine);
  const formatted = {};
  for (const [path, entry] of Object.entries(catalog.nodes ?? {})) {
    if (isCollectionField(artifact, path)) continue;
    let value;
    try {
      value = engine.resolve(path);
    } catch (err) {
      reportError("reportFormatted.value", err);
      continue;
    }
    if (value === null || value === undefined) continue;

    if (typeof value === "number") {
      const shown = displayValue(artifact, entry.dimension, entry.unit, value, nl);
      const number =
        entry.decimals != null && typeof shown === "number"
          ? shown.toFixed(entry.decimals)
          : formatValue(shown);
      const symbol = entry.symbol ?? null;
      formatted[path] = symbol
        ? {
            text: symbol === "%" ? `${number}${symbol}` : `${number} ${symbol}`,
            number,
            unit: symbol,
          }
        : { text: number, number };
      continue;
    }

    if (typeof value === "string") {
      const text = entry.option_labels?.[value] ?? value;
      if (text !== "") formatted[path] = { text };
      continue;
    }

    if (typeof value === "boolean") formatted[path] = { text: String(value) };
  }
  return formatted;
}
