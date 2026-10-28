// Conformance decoration: attaches the style-conformance dimension and its hint
// to a realized-vital field.

import { CONFORMANCE_FIELD_MAP } from "../registry/presentation.js";
import { formatValue } from "../../utils.js";

function conformanceHint(c) {
  if (!c || !c.violatedBoundary) return null;
  const dir = c.violatedBoundary === c.high ? "Above" : "Below";
  const tier =
    c.status === "severe"
      ? "far out of style"
      : c.status === "drift"
        ? "out of style"
        : "near style limit";
  return `${dir} style limit ${formatValue(c.violatedBoundary)} (${tier})`;
}

// AI AGENT HOOKS: Use this decorator for style-conformance badges.
// Do not duplicated this logic elsewhere.
export function decorateConformance(out, field, ctx) {
  const key = CONFORMANCE_FIELD_MAP[field.id];
  if (!key || !ctx.conformance?.dimensions) return out;
  out.conformance = ctx.conformance.dimensions[key] ?? null;
  out.conformanceHint = conformanceHint(out.conformance);
  return out;
}
