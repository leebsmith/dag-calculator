// User catalog CRUD surface: a generic, schema-driven editor for user-authored
// items, mounted in the menu bar. Each catalog renders an input per declared
// primitive_schema field (excluding the identity field), driven by the same
// schema the seeds conform to — no bespoke per-catalog templates.
//
// Dimension fields are unit-aware: they display in the master `unitMode` pick
// (imperial/metric) and convert back to base (metric) on input, so the store —
// the persistence boundary — always holds base units. Mirrors the producer's
// "display in unit, store base" convention.

import { CATALOGS } from "../store/userCatalog.js";
import { toBase } from "../engine/units.js";
import { displayValue, nonlinearFns } from "../views/producer.js";
import { UNIT_DIMENSIONS, UNIT_SYMBOLS, unitDecimals } from "../views/registry/units.js";

function buildTabs() {
  return Object.entries(CATALOGS).map(([id, meta]) => ({ id, label: meta.label }));
}

export function registerUserCatalogUi(app, ctx) {
  const { artifact, engine } = ctx;
  const nl = () => nonlinearFns(artifact, engine);

  Object.assign(app, {
    userCatalogOpen: false,
    userCatalogTab: "malt",
    userCatalogDraft: null, // the component being edited (null = closed)
    userCatalogNew: false, // editing a fresh item vs an existing one
    userCatalogErrors: [],
  });

  Object.defineProperties(app, {
    userCatalogTabs: {
      configurable: true,
      get() {
        return buildTabs();
      },
    },
    userCatalogItems: {
      configurable: true,
      get() {
        void this.catalogRevision;
        return this.userCatalog.list(this.userCatalogTab);
      },
    },
    userCatalogFields: {
      configurable: true,
      get() {
        const meta = CATALOGS[this.userCatalogTab];
        const schema = artifact.primitive_schemas?.[meta?.schema] ?? {};
        return Object.entries(schema)
          .filter(([field]) => field !== meta.idField)
          .map(([field, spec]) => {
            if (spec.taxonomy) {
              return {
                field,
                label: field,
                kind: "select",
                options: artifact.taxonomies?.[spec.taxonomy] ?? [],
              };
            }
            if (!spec.dimension) return { field, label: field, kind: "text" };
            const dimDef = UNIT_DIMENSIONS.find((d) => d.id === spec.dimension);
            if (!dimDef) {
              return { field, label: field, kind: "number", dimension: spec.dimension, unitId: null, symbol: null };
            }
            const unitId = this.unitMode[spec.dimension] ?? dimDef.default ?? dimDef.units[0][0];
            return {
              field,
              label: field,
              kind: "number",
              dimension: spec.dimension,
              unitId,
              symbol: UNIT_SYMBOLS[spec.dimension]?.[unitId] ?? unitId,
              decimals: unitDecimals(spec.dimension, unitId),
            };
          });
      },
    },
  });

  Object.assign(app, {
    openUserCatalog() {
      this.userCatalogOpen = true;
    },

    closeUserCatalog() {
      this.userCatalogOpen = false;
      this.userCatalogDraft = null;
      this.userCatalogErrors = [];
    },

    userItemId(item) {
      return item?.id ?? item?.report_id ?? "";
    },

    userItemTitle(item) {
      return item?.name ?? item?.laboratory ?? this.userItemId(item);
    },

    userFieldDisplay(field) {
      const value = this.userCatalogDraft?.[field];
      if (value === undefined || value === null) return "";
      const spec = this.userCatalogFields.find((f) => f.field === field);
      if (!spec || spec.kind !== "number") return value;
      if (!spec.unitId || spec.dimension == null) return value; // non-toggleable dimension (raw)
      const shown = displayValue(artifact, spec.dimension, spec.unitId, value, nl());
      if (spec.decimals != null) return Number(shown.toFixed(spec.decimals));
      return Math.round(shown * 1000) / 1000;
    },

    userSetField(field, value) {
      const spec = this.userCatalogFields.find((f) => f.field === field);
      const next = { ...this.userCatalogDraft };
      if (value === "") {
        delete next[field];
      } else if (spec?.kind === "number") {
        let n = Number(value);
        if (Number.isFinite(n) && spec.unitId && spec.dimension != null) {
          n = toBase(artifact, spec.dimension, spec.unitId, n, nl());
        }
        next[field] = Number.isFinite(n) ? n : 0;
      } else {
        next[field] = value;
      }
      this.userCatalogDraft = next;
    },

    newUserItem() {
      this.userCatalogDraft = {};
      this.userCatalogNew = true;
      this.userCatalogErrors = [];
    },

    editUserItem(id) {
      const item = this.userCatalog.catalogs[this.userCatalogTab]?.[id];
      this.userCatalogDraft = item ? { ...item } : null;
      this.userCatalogNew = false;
      this.userCatalogErrors = [];
    },

    saveUserItem() {
      const meta = CATALOGS[this.userCatalogTab];
      const draft = { ...this.userCatalogDraft };
      try {
        if (this.userCatalogNew) {
          this.userCatalog.add(this.userCatalogTab, draft);
        } else {
          this.userCatalog.update(this.userCatalogTab, draft[meta.idField], draft);
        }
        this.userCatalogErrors = [];
        this.userCatalogDraft = null;
        this.refreshUserItems();
      } catch (err) {
        this.userCatalogErrors = err?.errors ?? [{ field: "*", message: String(err?.message ?? err) }];
      }
    },

    deleteUserItem(id) {
      this.userCatalog.remove(this.userCatalogTab, id);
      if (this.userCatalogDraft && this.userItemId(this.userCatalogDraft) === id) {
        this.userCatalogDraft = null;
      }
      this.refreshUserItems();
    },

    selectUserCatalogTab(id) {
      this.userCatalogTab = id;
      this.userCatalogDraft = null;
      this.userCatalogErrors = [];
    },
  });
}
