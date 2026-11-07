// Library field models: scalar artifact fields and flat record-list fields.
// The library's editor binds to these models; this module owns no persistence.

import { CATALOGS, schemaFor } from "../store/userCatalog.js";
import { UNIT_DIMENSIONS, UNIT_SYMBOLS, unitDecimals } from "../views/registry/units.js";
import { formatPercent, unitSymbol } from "../utils.js";

const CAPTURE_FIELDS = new Set(["yield_basis"]);
const FIELD_LABELS = {
  sta1: "STA1 / diastaticus",
  pof: "POF",
};
const TAXONOMY_LABELS = {
  pof_status: { unknown: "Unknown", positive: "Positive", negative: "Negative" },
};

function isCapturedField(field) {
  return (
    field === "forked_from_id" ||
    field === "forked_from_name" ||
    CAPTURE_FIELDS.has(field) ||
    field.endsWith("_provenance")
  );
}

function numberField(field, spec, unitMode) {
  const dimDef = UNIT_DIMENSIONS.find((entry) => entry.id === spec.dimension);
  if (!dimDef) {
    return {
      field,
      label: field,
      kind: "number",
      dimension: spec.dimension,
      unitId: null,
      symbol: null,
    };
  }
  const unitId = unitMode[spec.dimension] ?? dimDef.default ?? dimDef.units[0][0];
  return {
    field,
    label: field,
    kind: "number",
    dimension: spec.dimension,
    unitId,
    symbol: unitSymbol(UNIT_SYMBOLS, spec.dimension, unitId),
    decimals: unitDecimals(spec.dimension, unitId),
  };
}

function listField(field, label, spec, view) {
  return {
    field,
    label,
    kind: "list",
    fields: Object.entries(spec.item ?? {}).map(([itemField, itemSpec]) =>
      itemSpec.dimension
        ? numberField(itemField, itemSpec, view.unitMode)
        : { field: itemField, label: itemField, kind: "text" }
    ),
  };
}

function referenceField(field, label, spec, cache) {
  const refs = cache.references?.[spec.reference] ?? {};
  return {
    field,
    label,
    kind: "select",
    options: Object.keys(refs),
    optionLabels: Object.fromEntries(
      Object.entries(refs).map(([id, record]) => [id, record.name ?? id])
    ),
  };
}

function taxonomyField(field, label, spec, artifact) {
  return {
    field,
    label,
    kind: "select",
    options: artifact.taxonomies?.[spec.taxonomy] ?? [],
    optionLabels: TAXONOMY_LABELS[spec.taxonomy] ?? null,
  };
}

export function attenuationRangeOf(draft) {
  const low = draft?.attenuation_low_pct;
  const high = draft?.attenuation_high_pct;
  return typeof low === "number" && typeof high === "number" ? { low, high } : null;
}

function fieldModel(field, spec, { artifact, cache, view }) {
  const label = FIELD_LABELS[field] ?? field;
  let model;
  if (spec.type === "list") model = listField(field, label, spec, view);
  else if (spec.format === "date") model = { field, label, kind: "date" };
  else if (spec.reference) model = referenceField(field, label, spec, cache);
  else if (spec.taxonomy) model = taxonomyField(field, label, spec, artifact);
  else if (spec.type === "boolean") model = { field, label, kind: "boolean" };
  else if (!spec.dimension) model = { field, label, kind: "text" };
  else model = numberField(field, spec, view.unitMode);

  if (field === "attenuation_cap_pct") {
    const range = attenuationRangeOf(view.libraryDraft);
    if (range) {
      model.readOnly = true;
      model.hint = `Cap follows the published high (${formatPercent(range.high, 0)})`;
    }
  }
  return model;
}

export function createLibraryFields({ artifact, cache, getView }) {
  return Object.defineProperties({}, {
    activeSchema: {
      configurable: true,
      get() {
        const view = getView();
        const meta = CATALOGS[view.activeKind];
        if (!meta) return {};
        if (meta.schemaSource === "records") {
          return schemaFor(view.activeKind)?.fields ?? {};
        }
        return artifact.primitive_schemas?.[meta.schema] ?? {};
      },
    },
    libraryFields: {
      configurable: true,
      get() {
        const view = getView();
        const meta = CATALOGS[view.activeKind];
        if (!meta) return [];
        const schema = view.activeSchema ?? {};
        return Object.entries(schema)
          .filter(([field]) => field !== meta.idField && !isCapturedField(field))
          .map(([field, spec]) => fieldModel(field, spec, { artifact, cache, view }));
      },
    },
  });
}

export const KEYS = ["activeSchema", "libraryFields"];
