// Catalog registry + component validation (pure).
//
// The registry is data/catalogs.json — the same file the backend reads. User
// records live on the server per user and are fetched by store/library.js; this
// module holds no persistence.

import catalogsData from "../../../data/catalogs.json" with { type: "json" };

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

export function slugify(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const DOMAIN_OPS = {
  gt: (a, b) => a > b,
  gte: (a, b) => a >= b,
  lt: (a, b) => a < b,
  lte: (a, b) => a <= b,
  eq: (a, b) => a === b,
  ne: (a, b) => a !== b,
};

function resolveLimit(limitExpr, constants) {
  if (typeof limitExpr === "number") return limitExpr;
  if (limitExpr && typeof limitExpr === "object" && "const" in limitExpr) {
    return constants?.[limitExpr.const]?.value;
  }
  return undefined;
}

function domainViolation(domain, value, constants) {
  for (const [op, limitExpr] of Object.entries(domain ?? {})) {
    const test = DOMAIN_OPS[op];
    if (!test) continue;
    const limit = resolveLimit(limitExpr, constants);
    if (limit === undefined || limit === null || Number.isNaN(limit)) continue;
    if (!test(value, limit)) return { op, limit };
  }
  return null;
}

// Mirror of the seed-conformance checkComponent: a component must only carry
// declared fields, and each field must honor its dimension/domain/taxonomy/type.
// Returns an array of { field, message }; empty means valid.
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

  for (const [field, value] of Object.entries(component)) {
    if (!(field in schema)) {
      errors.push({ field, message: `undeclared field "${field}"` });
      continue;
    }
    if (value === undefined || value === null || value === "") continue;
    const spec = schema[field];
    if (spec.dimension) {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        errors.push({ field, message: "must be a number" });
        continue;
      }
      if (domainViolation(spec.domain, value, artifact?.constants)) {
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
