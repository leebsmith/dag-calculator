// Record-library surface: kind tabs, a schema-generated create form, deletion,
// and read-only seed listings. Records live on the server via store/library.js;
// this adapter only owns view state and the write actions.

import { CATALOGS, validateComponent } from "../store/userCatalog.js";
import { toBase } from "../engine/units.js";
import { displayValue, nonlinearFns } from "../views/producer.js";
import { UNIT_DIMENSIONS, UNIT_SYMBOLS, unitDecimals } from "../views/registry/units.js";

function tabs() {
  return Object.entries(CATALOGS).map(([id, meta]) => ({ id, label: meta.label }));
}

function identityOf(meta, item) {
  return item?.[meta?.idField] ?? item?.id ?? "";
}

function titleOf(meta, item) {
  return item?.[meta?.titleField ?? "name"] ?? identityOf(meta, item);
}

export function registerLibraryUi(app, ctx) {
  const { artifact, engine, cache } = ctx;
  const nl = () => nonlinearFns(artifact, engine);

  Object.assign(app, {
    libraryOpen: false,
    libraryTab: "equipment",
    libraryDraft: null,
    libraryErrors: [],
    libraryNotice: "",
  });

  Object.defineProperties(app, {
    libraryTabs: {
      configurable: true,
      get() {
        return tabs();
      },
    },
    libraryRecords: {
      configurable: true,
      get() {
        void this.libraryRevision;
        return this.library.list(this.libraryTab);
      },
    },
    librarySeedItems: {
      configurable: true,
      get() {
        void this.libraryRevision;
        const meta = CATALOGS[this.libraryTab];
        const seeds = cache.seeds[meta?.seedKey] ?? {};
        return Object.values(seeds).slice(0, 50);
      },
    },
    librarySeedCount: {
      configurable: true,
      get() {
        const meta = CATALOGS[this.libraryTab];
        return Object.keys(cache.seeds[meta?.seedKey] ?? {}).length;
      },
    },
    libraryLoading: {
      configurable: true,
      get() {
        void this.libraryRevision;
        return this.library.loading();
      },
    },
    libraryError: {
      configurable: true,
      get() {
        void this.libraryRevision;
        return this.library.error();
      },
    },
    libraryFields: {
      configurable: true,
      get() {
        const meta = CATALOGS[this.libraryTab];
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
              return {
                field,
                label: field,
                kind: "number",
                dimension: spec.dimension,
                unitId: null,
                symbol: null,
              };
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
    openLibrary(kind) {
      if (kind && CATALOGS[kind]) this.libraryTab = kind;
      this.libraryOpen = true;
      this.libraryDraft = null;
      this.libraryErrors = [];
      this.libraryNotice = "";
      if (!this.library.loaded() && !this.library.loading()) {
        this.library.refresh().then(() => this.refreshLibraryItems());
      }
    },

    closeLibrary() {
      this.libraryOpen = false;
      this.libraryDraft = null;
      this.libraryErrors = [];
      this.libraryNotice = "";
    },

    selectLibraryTab(id) {
      if (!CATALOGS[id]) return;
      this.libraryTab = id;
      this.libraryDraft = null;
      this.libraryErrors = [];
      this.libraryNotice = "";
    },

    libraryItemId(item) {
      return identityOf(CATALOGS[this.libraryTab], item);
    },

    libraryItemTitle(item) {
      return titleOf(CATALOGS[this.libraryTab], item);
    },

    librarySeedItemTitle(item) {
      const meta = CATALOGS[this.libraryTab];
      return titleOf(meta, item);
    },

    libraryFieldDisplay(field) {
      const value = this.libraryDraft?.[field];
      if (value === undefined || value === null) return "";
      const spec = this.libraryFields.find((f) => f.field === field);
      if (!spec || spec.kind !== "number") return value;
      if (!spec.unitId || spec.dimension == null) return value;
      const shown = displayValue(artifact, spec.dimension, spec.unitId, value, nl());
      if (spec.decimals != null) return Number(shown.toFixed(spec.decimals));
      return Math.round(shown * 1000) / 1000;
    },

    librarySetField(field, value) {
      const spec = this.libraryFields.find((f) => f.field === field);
      const next = { ...this.libraryDraft };
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
      this.libraryDraft = next;
    },

    newLibraryItem() {
      this.libraryDraft = {};
      this.libraryErrors = [];
      this.libraryNotice = "";
    },

    cancelLibraryItem() {
      this.libraryDraft = null;
      this.libraryErrors = [];
    },

    async saveLibraryItem() {
      if (!this.libraryDraft) return;
      const meta = CATALOGS[this.libraryTab];
      const draft = { ...this.libraryDraft };
      delete draft[meta.idField];
      const errors = validateComponent(artifact, this.libraryTab, draft);
      if (errors.length) {
        this.libraryErrors = errors;
        return;
      }
      try {
        await this.library.create(this.libraryTab, draft);
        this.libraryErrors = [];
        this.libraryDraft = null;
        this.libraryNotice = "Saved. Records are immutable; corrections create a new record.";
        this.refreshLibraryItems();
      } catch (err) {
        this.libraryErrors =
          err?.details?.errors?.map((message) => ({ field: "*", message })) ??
          err?.errors ??
          [{ field: "*", message: String(err?.message ?? err) }];
      }
    },

    async deleteLibraryItem(itemId) {
      if (!itemId) return;
      if (typeof window !== "undefined" && !window.confirm("Delete this record permanently?")) {
        return;
      }
      try {
        await this.library.remove(this.libraryTab, itemId);
        if (this.libraryDraft && this.libraryItemId(this.libraryDraft) === itemId) {
          this.libraryDraft = null;
        }
        this.libraryNotice = "";
        this.refreshLibraryItems();
      } catch (err) {
        this.libraryErrors = [{ field: "*", message: String(err?.message ?? err) }];
      }
    },
  });
}
