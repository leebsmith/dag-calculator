// User-authored catalog items: a device-local overlay on the immutable seeds.
//
// A "user item" is a full component conforming to the same primitive_schema as
// its seed catalog, owned by the user, stored under a reserved `u:` id prefix so
// it can never collide with a seed id. It merges into the reference cache as a
// live overlay (see referenceCache.js syncUserItems); selection-referenced items
// therefore inherit provenance/drift exactly like seeds.
//
// Storage is localStorage (schema_version-stamped, mirroring unitPrefs.js) —
// device-local for now, Firestore later. Validation reuses the primitive_schema
// (declared fields, dimensions, domains, taxonomies) so a user item is
// indistinguishable from a seed at runtime.

export const PREFIX = "u:";
export const STORAGE_KEY = "brew_user_catalog";

// Catalog -> overlay metadata. `schema` is the primitive_schema name (also the
// `references` key when the catalog is selection-resolved); `seedKey` is the
// reference-cache `seeds` key used by the collection pickers; `idField` is the
// component's identity field (water_report keys by `report_id`, the rest by
// `id`).
export const CATALOGS = {
  malt:         { label: "Malt",         schema: "malt",         referencesKey: null,           seedKey: "malts",        idField: "id" },
  yeast:        { label: "Yeast",        schema: "yeast",        referencesKey: "yeast",        seedKey: "yeasts",       idField: "id" },
  hop:          { label: "Hop",          schema: "hop",          referencesKey: "hop",          seedKey: "hops",         idField: "id" },
  sugar:        { label: "Sugar",        schema: "sugar",        referencesKey: null,           seedKey: "sugars",       idField: "id" },
  equipment:    { label: "Equipment",    schema: "equipment",    referencesKey: "equipment",    seedKey: "equipment",    idField: "id" },
  water_report: { label: "Water Report", schema: "water_report", referencesKey: "water_report", seedKey: "waterReports", idField: "report_id", titleField: "laboratory" },
  water_target: { label: "Water Target", schema: "water_target", referencesKey: "water_target", seedKey: "waterTargets", idField: "id" },
};

function titleFieldOf(meta) {
  return meta?.titleField ?? "name";
}

export function isUserItem(id) {
  return typeof id === "string" && id.startsWith(PREFIX);
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
  const titleField = titleFieldOf(meta);
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

export class CatalogValidationError extends Error {
  constructor(errors) {
    super("Invalid catalog item");
    this.name = "CatalogValidationError";
    this.errors = errors;
  }
}

function storageOf(storage) {
  if (storage) return storage;
  if (typeof localStorage !== "undefined") return localStorage;
  return null;
}

function readCatalogs(artifact, storage) {
  const s = storageOf(storage);
  if (!s) return null;
  try {
    const raw = JSON.parse(s.getItem(STORAGE_KEY) ?? "null");
    if (!raw || raw.schema_version !== (artifact?.schema_version ?? 2)) return null;
    return raw.catalogs ?? null;
  } catch {
    return null;
  }
}

function emptyCatalogs() {
  return Object.fromEntries(Object.keys(CATALOGS).map((c) => [c, {}]));
}

function sanitize(artifact, raw) {
  const out = emptyCatalogs();
  if (!raw || typeof raw !== "object") return out;
  for (const [catalog, items] of Object.entries(raw)) {
    if (!(catalog in CATALOGS) || !items || typeof items !== "object") continue;
    for (const [id, component] of Object.entries(items)) {
      if (!component || typeof component !== "object") continue;
      if (component[CATALOGS[catalog].idField] !== id) continue;
      if (validateComponent(artifact, catalog, component).length) continue;
      out[catalog][id] = component;
    }
  }
  return out;
}

function uniqueId(catalog, name, catalogs) {
  const base = PREFIX + (slugify(name) || "item");
  const used = new Set(Object.keys(catalogs[catalog] ?? {}));
  let id = base;
  let n = 2;
  while (used.has(id)) id = `${base}-${n++}`;
  return id;
}

export function createUserCatalog({ artifact, storage, onChange } = {}) {
  const store = {
    catalogs: sanitize(artifact, readCatalogs(artifact, storage)),
    onChange,

    list(catalog) {
      return Object.values(this.catalogs[catalog] ?? {});
    },

    validate(catalog, component) {
      return validateComponent(artifact, catalog, component);
    },

    add(catalog, component) {
      const meta = CATALOGS[catalog];
      if (!meta) throw new CatalogValidationError([{ field: "*", message: `unknown catalog "${catalog}"` }]);
      const id = uniqueId(catalog, component?.[titleFieldOf(meta)], this.catalogs);
      const item = { ...component, [meta.idField]: id };
      const errors = validateComponent(artifact, catalog, item);
      if (errors.length) throw new CatalogValidationError(errors);
      this.catalogs[catalog] = { ...this.catalogs[catalog], [id]: item };
      this.persist();
      return item;
    },

    update(catalog, id, patch) {
      const meta = CATALOGS[catalog];
      const existing = this.catalogs[catalog]?.[id];
      if (!meta || !existing) return null;
      const next = { ...existing, ...patch, [meta.idField]: id };
      const errors = validateComponent(artifact, catalog, next);
      if (errors.length) throw new CatalogValidationError(errors);
      this.catalogs[catalog] = { ...this.catalogs[catalog], [id]: next };
      this.persist();
      return next;
    },

    remove(catalog, id) {
      if (!this.catalogs[catalog]?.[id]) return false;
      const next = { ...this.catalogs[catalog] };
      delete next[id];
      this.catalogs[catalog] = next;
      this.persist();
      return true;
    },

    // Clone a seed component into a new user item (id re-derived from name).
    duplicateFrom(catalog, seedComponent) {
      const meta = CATALOGS[catalog];
      if (!meta) throw new CatalogValidationError([{ field: "*", message: `unknown catalog "${catalog}"` }]);
      const copy = { ...seedComponent };
      delete copy[meta.idField];
      return this.add(catalog, copy);
    },

    persist() {
      const s = storageOf(storage);
      if (s) {
        try {
          s.setItem(
            STORAGE_KEY,
            JSON.stringify({ schema_version: artifact?.schema_version ?? 2, catalogs: this.catalogs })
          );
        } catch {
          /* storage unavailable — items just won't persist */
        }
      }
      this.onChange?.();
    },
  };
  return store;
}
