// Catalog registry + component validation (pure).
//
// Two sources share one registry:
// - `data/catalogs.json` — records whose schema is an artifact primitive schema.
// - `data/record_catalogs.json` — non-DAG measurement documents whose schema is
//   in `data/record_schemas.json`.
//
// User records live on the server per user and are fetched by store/library.js;
// this module holds no persistence.

import catalogsData from "../../../data/catalogs.json" with { type: "json" };
import recordCatalogsData from "../../../data/record_catalogs.json" with { type: "json" };
import recordSchemas from "../../../data/record_schemas.json" with { type: "json" };
import { checkComponentDomain } from "../engine/domains.js";
import { safeHref } from "../utils.js";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function catalogMeta(kind, meta, source) {
  return {
    label: meta.label,
    schema: meta.schema,
    schemaSource: source,
    referencesKey: meta.references_key,
    seedKey: meta.seed_key,
    idField: meta.id_field,
    titleField: meta.title_field,
  };
}

export const CATALOGS = Object.fromEntries([
  ...Object.entries(catalogsData).map(([kind, meta]) => [
    kind,
    catalogMeta(kind, meta, "artifact"),
  ]),
  ...Object.entries(recordCatalogsData).map(([kind, meta]) => [
    kind,
    catalogMeta(kind, meta, "records"),
  ]),
]);

export const CATALOG_KINDS = Object.keys(CATALOGS);

// Reference data has two classes. Identity sources define a batch (one of each is
// snapshotted into its identity); formulation records are step-local selections.
export const IDENTITY_KINDS = ["style", "equipment", "water_report"];
export const INGREDIENT_KINDS = CATALOG_KINDS.filter((kind) => !IDENTITY_KINDS.includes(kind));

export function catalogClass(kind) {
  if (IDENTITY_KINDS.includes(kind)) return "identity";
  if (INGREDIENT_KINDS.includes(kind)) return "formulation";
  return null;
}

export const SEED_KEY_TO_CATALOG = Object.fromEntries(
  Object.entries(CATALOGS).map(([catalog, meta]) => [meta.seedKey, catalog])
);

// Legacy device-local ids were `u:`-prefixed; remote records use server ids.
export function isUserItem(id) {
  return typeof id === "string" && id.startsWith("u:");
}

// The catalogue rows the unified reference cache exposes for a kind. Seed and
// library records share one map, so the pickers, the import ledger and the gate
// all read the same set.
export function catalogRecords(cache, kind) {
  const meta = CATALOGS[kind];
  if (!meta) return [];
  const map = meta.seedKey
    ? cache.seeds?.[meta.seedKey]
    : cache.references?.[meta.referencesKey];
  return Object.values(map ?? {});
}

export function catalogRecord(cache, kind, id) {
  const meta = CATALOGS[kind];
  if (!meta || !id) return null;
  const seeded = meta.seedKey ? cache.seeds?.[meta.seedKey]?.[id] : null;
  return seeded ?? cache.references?.[meta.referencesKey]?.[id] ?? null;
}

export function schemaFor(catalog) {
  const meta = CATALOGS[catalog];
  if (!meta) return null;
  return meta.schemaSource === "records"
    ? recordSchemas[meta.schema] ?? null
    : null;
}

function missing(value) {
  return (
    value === undefined ||
    value === null ||
    value === "" ||
    (Array.isArray(value) && value.length === 0)
  );
}

function validateScalar(artifact, spec, value, field, errors) {
  if (spec.type === "list") {
    validateList(artifact, spec, value, field, errors);
    return;
  }
  if (spec.type === "string") {
    if (typeof value !== "string") {
      errors.push({ field, message: "must be a string" });
      return;
    }
    if (spec.format === "date" && (!ISO_DATE.test(value) || Number.isNaN(Date.parse(value)))) {
      errors.push({ field, message: "must be an ISO date (YYYY-MM-DD)" });
    }
    return;
  }
  if (spec.dimension) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      errors.push({ field, message: "must be a number" });
      return;
    }
    const result = checkComponentDomain(artifact, spec.domain, value);
    if (result.bounded && result.holds === false) {
      errors.push({ field, message: `violates ${JSON.stringify(spec.domain)}` });
    }
    return;
  }
  if (spec.taxonomy) {
    const allowed = artifact?.taxonomies?.[spec.taxonomy];
    if (!allowed?.includes(value)) {
      errors.push({ field, message: `"${value}" is not in taxonomy ${spec.taxonomy}` });
    }
    return;
  }
  if (spec.type === "boolean" && typeof value !== "boolean") {
    errors.push({ field, message: "must be a boolean" });
  }
}

function validateList(artifact, spec, value, field, errors) {
  if (!Array.isArray(value)) {
    errors.push({ field, message: "must be a list" });
    return;
  }
  if (typeof spec.min_items === "number" && value.length < spec.min_items) {
    errors.push({ field, message: `needs at least ${spec.min_items} rows` });
  }
  const item = spec.item ?? {};
  if (Object.values(item).some((entry) => entry?.type === "list")) {
    errors.push({ field, message: "nested lists are not supported" });
    return;
  }
  const ordered = [];
  value.forEach((row, index) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      errors.push({ field: `${field}.${index}`, message: "row must be an object" });
      return;
    }
    for (const [key, entrySpec] of Object.entries(item)) {
      const valueAt = row[key];
      if (missing(valueAt)) {
        if (entrySpec.required) {
          errors.push({ field: `${field}.${index}.${key}`, message: `${key} is required` });
        }
        continue;
      }
      validateScalar(artifact, entrySpec, valueAt, `${field}.${index}.${key}`, errors);
    }
    for (const key of Object.keys(row)) {
      if (!(key in item)) {
        errors.push({ field: `${field}.${index}.${key}`, message: `undeclared field "${key}"` });
      }
    }
    if (spec.ordered_by && typeof row[spec.ordered_by] === "number") {
      ordered.push(row[spec.ordered_by]);
    }
  });
  for (let index = 1; index < ordered.length; index += 1) {
    if (ordered[index] <= ordered[index - 1]) {
      errors.push({
        field: `${field}.${index}.${spec.ordered_by}`,
        message: "times must be strictly increasing and unique",
      });
    }
  }
}

export function validateRecordComponent(artifact, schema, component, meta) {
  if (!schema) return [{ field: "*", message: "unknown record schema" }];
  if (!component || typeof component !== "object" || Array.isArray(component)) {
    return [{ field: "*", message: "component must be an object" }];
  }
  const errors = [];
  const titleField = meta.titleField ?? "name";
  if (missing(component[titleField])) {
    errors.push({ field: titleField, message: `${titleField} is required` });
  }
  const idField = meta.idField;
  if (idField && idField in component && typeof component[idField] !== "string") {
    errors.push({ field: idField, message: "must be a string" });
  }
  for (const [field, spec] of Object.entries(schema.fields ?? {})) {
    const value = component[field];
    if (missing(value)) {
      if (spec.required) errors.push({ field, message: `${field} is required` });
      continue;
    }
    validateScalar(artifact, spec, value, field, errors);
  }
  for (const field of Object.keys(component)) {
    if (!(field in (schema.fields ?? {}))) {
      errors.push({ field, message: `undeclared field "${field}"` });
    }
  }
  return errors;
}

export function validateComponent(artifact, catalog, component) {
  const meta = CATALOGS[catalog];
  if (!meta) return [{ field: "*", message: `unknown catalog "${catalog}"` }];
  if (meta.schemaSource === "records") {
    return validateRecordComponent(artifact, recordSchemas[meta.schema], component, meta);
  }
  return validateArtifactComponent(artifact, meta, component);
}

// Mirror of the server-side validate_component: a component must only carry
// declared fields, and each field must honor its dimension/domain/taxonomy/type.
// Domain evaluation delegates to the engine's shared evaluator; URL fields are
// restricted to http(s). Returns an array of { field, message }; empty means valid.
function validateArtifactComponent(artifact, meta, component) {
  const schema = artifact?.primitive_schemas?.[meta.schema];
  if (!schema) return [{ field: "*", message: `unknown schema "${meta.schema}"` }];
  if (!component || typeof component !== "object") {
    return [{ field: "*", message: "component must be an object" }];
  }

  const errors = [];
  const titleField = meta.titleField ?? "name";
  if (typeof component[titleField] !== "string" || !component[titleField].trim()) {
    errors.push({ field: titleField, message: `${titleField} is required` });
  }
  const idField = meta.idField;
  if (idField && idField in component && typeof component[idField] !== "string") {
    errors.push({ field: idField, message: "must be a string" });
  }

  for (const [field, value] of Object.entries(component)) {
    if (!(field in schema)) {
      errors.push({ field, message: `undeclared field "${field}"` });
      continue;
    }
    if (value === undefined || value === null || value === "") continue;
    const spec = schema[field];
    if (field === "url") {
      if (typeof value !== "string" || safeHref(value) === "") {
        errors.push({ field, message: "must be an http(s) URL" });
      }
      continue;
    }
    if (spec.dimension) {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        errors.push({ field, message: "must be a number" });
        continue;
      }
      const result = checkComponentDomain(artifact, spec.domain, value);
      if (result.bounded && result.holds === false) {
        errors.push({ field, message: `violates ${JSON.stringify(spec.domain)}` });
      }
    } else if (spec.taxonomy) {
      const allowed = artifact?.taxonomies?.[spec.taxonomy];
      if (!allowed?.includes(value)) {
        errors.push({ field, message: `"${value}" is not in taxonomy ${spec.taxonomy}` });
      }
    } else if (spec.type === "boolean" && typeof value !== "boolean") {
      errors.push({ field, message: "must be a boolean" });
    }
  }
  return errors;
}
