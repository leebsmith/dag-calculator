// Scalar valuation: resolves one projected field, applies display units,
// validation, and presentation overrides.

import { refKey, resolveReference } from "../../engine/paths.js";
import { fromBase } from "../../engine/units.js";
import { UNIT_DIMENSIONS, UNIT_SYMBOLS, unitDecimals } from "../registry/units.js";
import { unitSymbol } from "../../utils.js";
import { applyPresentation, presentationFor } from "../registry/presentation.js";
import { formatCell } from "./cell.js";
import { reportError } from "../../observability.js";

// Resolve a field's value, falling back to its authored root when a mirrored
// solved path is not available yet. A failure is reported, never swallowed.
function resolveFieldValue(field, engine) {
  const sourcePath = field.valuePath ?? field.id;
  try {
    return { ok: true, value: engine.resolve(sourcePath) };
  } catch (err) {
    if (!field.valuePath) {
      reportError("producer.scalar.value", err);
      return { ok: false };
    }
    try {
      return { ok: true, value: engine.resolve(field.id) };
    } catch (fallbackError) {
      reportError("producer.scalar.value", fallbackError);
      return { ok: false };
    }
  }
}

function resolveUnit(field, unitMode) {
  const toggleableDims = new Set(UNIT_DIMENSIONS.map((d) => d.id));
  const toggleable = Boolean(field.dimension && toggleableDims.has(field.dimension));
  const dimDef = toggleable ? UNIT_DIMENSIONS.find((d) => d.id === field.dimension) : null;
  const baseUnitId = dimDef?.units[0]?.[0] ?? null;
  const inheritedUnitId = toggleable
    ? field.displayUnit ?? unitMode[field.dimension] ?? dimDef?.default ?? null
    : null;
  const unitModeKey = field.valuePath ?? field.id;
  const unitId = toggleable ? unitMode[unitModeKey] ?? inheritedUnitId : null;
  return { toggleable, baseUnitId, inheritedUnitId, unitId };
}

// AI AGENT HOOKS: Use this valuator for scalar field resolution and display
// units. Do not duplicated this logic elsewhere.
export function valuateScalar(field, engine, ctx, nl) {
  const { ui, artifact } = ctx;
  const unitMode = ui?.unitMode ?? {};
  const fieldDomains = ctx.fieldDomains ?? {};
  const resolved = resolveFieldValue(field, engine);
  if (!resolved.ok) return null;
  const value = resolved.value;
  // Display-only unit resolution (the base value stays canonical). A registry
  // `displayUnit` is a PIN — the field's preferred unit (e.g. salt in g) that
  // the master menu must not override. Precedence:
  //   per-field override → pin (displayUnit) → master (menu) → base unit.
  const { toggleable, baseUnitId, inheritedUnitId, unitId } = resolveUnit(field, unitMode);
  const shown =
    unitId && typeof value === "number" && artifact
      ? fromBase(artifact, field.dimension, unitId, value, nl)
      : value;
  const symbol = unitId ? field.symbol ?? unitSymbol(UNIT_SYMBOLS, field.dimension, unitId) : null;
  // A toggleable field with no unit id and no registry `unit` (e.g. equipment
  // conversion efficiency) still needs a pill label — fall back to the
  // dimension's base-unit symbol (so a fraction reads "×1", not blank).
  const fallbackSymbol = !symbol && toggleable ? unitSymbol(UNIT_SYMBOLS, field.dimension, baseUnitId, null) : null;
  // Display precision: registry override → unit-level → dimension fallback.
  // A null `unitId` (no preference set) still displays the base unit, so
  // resolve precision against the effective unit the value is shown in.
  const decimals = field.decimals ?? unitDecimals(field.dimension, unitId ?? baseUnitId);
  // Editable number inputs render their natural value (no fixed-decimal
  // padding) so a debounced re-render never rewrites "6" into "6.0" while the
  // user is mid-keystroke. Readouts keep their pinned precision.
  const display = formatCell(shown, {
    decimals: field.control === "number" ? null : decimals,
  }).display;
  const out = {
    ...field,
    value,
    unit: symbol ?? field.unit ?? fallbackSymbol,
    display,
    decimals,
    toggleable,
    unitId,
    // Accented ONLY on a deliberate per-field deviation from the inherited unit
    // (a pill override); master-following and pinned fields never are.
    customized: toggleable && unitId !== inheritedUnitId,
  };
  // Per-field domain state of the selected component (e.g. an equipment
  // constant), for inline surfacing.
  const vkey = refKey(resolveReference(artifact, field.id));
  out.validation = (vkey && fieldDomains[vkey]) || null;
  // Host-side presentation overrides (polymorphic labels/units, solver hints).
  // The artifact stays the sole owner of value semantics.
  const presentation = presentationFor(field.id);
  if (presentation) {
    applyPresentation(out, presentation, {
      get: (id) => engine.get(id),
      resolve: (path) => engine.resolve(path),
      displayFloor: (base) =>
        unitId && artifact ? fromBase(artifact, field.dimension, unitId, base, nl) : base,
    });
  }
  return out;
}
