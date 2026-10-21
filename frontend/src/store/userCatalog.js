// Catalog registry + component validation (pure).
//
// The registry is data/catalogs.json — the same file the backend reads. User
// records live on the server per user and are fetched by store/library.js; this
// module holds no persistence.

import catalogsData from "../../../data/catalogs.json" with { type: "json" };
import { checkComponentDomain } from "../engine/domains.js";
import { safeHref } from "../utils.js";

// Catalog kind -> registry metadata (camelCase view of the shared JSON).
export const CATALOGS = Object.fromEntries(
  Object.entries(catalogsData).map(([kind, meta]) => [
    kind,
    {
      label: meta.label,
      schema: meta.schema,
      referencesKey: meta.references_key,
      seedKey: meta.seed_key,
      idField: meta.id_field,
      titleField: meta.title_field,
    },
  ])
);

export const CATALOG_KINDS = Object.keys(CATALOGS);

export const SEED_KEY_TO_CATALOG = Object.fromEntries(
  Object.entries(CATALOGS).map(([catalog, meta]) => [meta.seedKey, catalog])
);

// Legacy device-local ids were `u:`-prefixed; remote records use server ids.
export function isUserItem(id) {
  return typeof id === "string" && id.startsWith("u:");
}

// Mirror of the server-side validate_component: a component must only carry
// declared fields, and each field must honor its dimension/domain/taxonomy/type.
// Domain evaluation delegates to the engine's shared evaluator; URL fields are
// restricted to http(s). Returns an array of { field, message }; empty means valid.
export function validateComponent(artifact, catalog, component) {
  const meta = CATALOGS[catalog];
  const schema = artifact?.primitive_schemas?.[meta?.schema];
  if (!schema) return [{ field: "*", message: `unknown catalog "${catalog}"` }];
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
    errors.push({ field: idField, message: `${idField} must be a string` });
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
      if (result.bounded && !result.holds) {
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
