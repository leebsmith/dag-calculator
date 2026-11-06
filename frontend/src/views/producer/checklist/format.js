// Checklist formatting. Uses the same catalog and display conversion as the
// report; a checklist value and a report value cannot disagree.

import { buildReportCatalog } from "../../registry/catalog.js";
import { displayValue, nonlinearFns } from "../../producer.js";
import { cellLabel, formatCell } from "../cell.js";
import { ignoreError } from "../../../observability.js";

export function createChecklistFormatter(
  artifact,
  engine,
  unitMode = {},
  catalog = null,
  reportError = ignoreError
) {
  const nodes = (catalog ?? buildReportCatalog(artifact, unitMode)).nodes ?? {};
  const nl = nonlinearFns(artifact, engine);

  function formatEntry(entry, value) {
    if (!entry || value === null || value === undefined) return "—";
    if (typeof value !== "number") {
      return entry.option_labels?.[value] ?? String(value);
    }
    const shown = displayValue(artifact, entry.dimension, entry.unit, value, nl);
    const cell = formatCell(shown, { decimals: entry.decimals });
    return cellLabel(cell.display, { symbol: entry.symbol });
  }

  return {
    path(path) {
      try {
        return formatEntry(nodes[path], engine.resolve(path));
      } catch (err) {
        if (!String(err?.message ?? "").includes("Unsupported type in fingerprint")) {
          reportError("checklist.format", err);
        }
        return "—";
      }
    },
    field(path, value) {
      return formatEntry(nodes[path], value);
    },
    text(template) {
      return String(template ?? "").replace(/\{\{([a-z0-9_.]+)\}\}/g, (_, path) => this.path(path));
    },
  };
}
