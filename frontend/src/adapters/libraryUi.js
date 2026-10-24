// Record-library surface: administration only. Two sections — Sources (the
// identity sources a batch is built from) and Ingredients (the step-local
// formulation records). Records are immutable: create/delete, and a style is
// forked before it is edited. Records live on the server via store/library.js;
// this adapter only owns view state and the write actions.
//
// Selection never happens here: pickers read the reference cache. The Library
// never references a batch.

import { CATALOGS, IDENTITY_KINDS, validateComponent } from "../store/userCatalog.js";
import { toBase } from "../engine/units.js";
import { displayValue, nonlinearFns } from "../views/producer.js";
import { UNIT_DIMENSIONS, UNIT_SYMBOLS, unitDecimals } from "../views/registry/units.js";

const LINEAGE_FIELDS = new Set(["forked_from_id", "forked_from_name"]);

function tabList(kinds) {
  return kinds.map((id) => ({ id, label: CATALOGS[id].label }));
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
    librarySection: "sources", // "sources" | "ingredients"
    sourceKind: "style",
    libraryTab: "malt",
    libraryDraft: null,
    libraryErrors: [],
    libraryNotice: "",
  });

  Object.defineProperties(app, {
    libraryTabs: {
      configurable: true,
      get() {
        return tabList(Object.keys(CATALOGS).filter((kind) => !IDENTITY_KINDS.includes(kind)));
      },
    },
    identityTabs: {
      configurable: true,
      get() {
        return tabList(IDENTITY_KINDS);
      },
    },
    activeKind: {
      configurable: true,
      get() {
        return this.librarySection === "sources" ? this.sourceKind : this.libraryTab;
      },
    },
    libraryRecords: {
      configurable: true,
      get() {
        void this.libraryRevision;
        return this.library.list(this.activeKind);
      },
    },
    librarySeedItems: {
      configurable: true,
      get() {
        void this.libraryRevision;
        const meta = CATALOGS[this.activeKind];
        const seeds = cache.seeds[meta?.seedKey] ?? {};
        return Object.values(seeds).slice(0, 50);
      },
    },
    librarySeedCount: {
      configurable: true,
      get() {
        void this.libraryRevision;
        const meta = CATALOGS[this.activeKind];
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
        const meta = CATALOGS[this.activeKind];
        const schema = artifact.primitive_schemas?.[meta?.schema] ?? {};
        return Object.entries(schema)
          .filter(([field]) => field !== meta.idField && !LINEAGE_FIELDS.has(field))
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
    // Styles are forked, never authored from scratch: a custom style starts as a
    // copy of an existing declaration.
    canAuthorRecord: {
      configurable: true,
      get() {
        return this.activeKind !== "style";
      },
    },
    canForkRecord: {
      configurable: true,
      get() {
        return this.activeKind === "style";
      },
    },
    activeKindLabel: {
      configurable: true,
      get() {
        return CATALOGS[this.activeKind]?.label ?? this.activeKind;
      },
    },
  });

  async function afterRecordsChanged(store) {
    store.libraryDraft = null;
    store.libraryErrors = [];
    await store.refreshLibraryItems();
    await store.onRecordsChanged?.();
  }

  Object.assign(app, {
    openLibrary(kind) {
      if (kind && IDENTITY_KINDS.includes(kind)) {
        this.librarySection = "sources";
        this.sourceKind = kind;
      } else if (kind && CATALOGS[kind]) {
        this.librarySection = "ingredients";
        this.libraryTab = kind;
      }
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

    selectLibrarySection(section) {
      if (section !== "sources" && section !== "ingredients") return;
      this.librarySection = section;
      this.libraryDraft = null;
      this.libraryErrors = [];
      this.libraryNotice = "";
    },

    selectSourceKind(kind) {
      if (!IDENTITY_KINDS.includes(kind)) return;
      this.librarySection = "sources";
      this.sourceKind = kind;
      this.libraryDraft = null;
      this.libraryErrors = [];
      this.libraryNotice = "";
    },

    selectLibraryTab(id) {
      if (!CATALOGS[id] || IDENTITY_KINDS.includes(id)) return;
      this.librarySection = "ingredients";
      this.libraryTab = id;
      this.libraryDraft = null;
      this.libraryErrors = [];
      this.libraryNotice = "";
    },

    libraryItemId(item) {
      return identityOf(CATALOGS[this.activeKind], item);
    },

    libraryItemTitle(item) {
      return titleOf(CATALOGS[this.activeKind], item);
    },

    librarySeedItemTitle(item) {
      const meta = CATALOGS[this.activeKind];
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
      if (!this.canAuthorRecord) return;
      this.libraryDraft = {};
      this.libraryErrors = [];
      this.libraryNotice = "";
    },

    // Fork a sealed style: copy its declaration, drop the identity field, record
    // display lineage. The server assigns the new id, so the record is immutable
    // from the moment it is saved.
    forkLibraryItem(item) {
      if (!this.canForkRecord || !item) return;
      const meta = CATALOGS[this.activeKind];
      const id = identityOf(meta, item);
      const draft = { ...item };
      delete draft[meta.idField];
      delete draft.id;
      draft.name = `${titleOf(meta, item)} (copy)`;
      draft.forked_from_id = id;
      draft.forked_from_name = titleOf(meta, item);
      this.libraryDraft = draft;
      this.libraryErrors = [];
      this.libraryNotice = `Forked from ${titleOf(meta, item)}. Edit the declaration, then save.`;
    },

    cancelLibraryItem() {
      this.libraryDraft = null;
      this.libraryErrors = [];
    },

    async saveLibraryItem() {
      if (!this.libraryDraft) return;
      const kind = this.activeKind;
      const meta = CATALOGS[kind];
      const draft = { ...this.libraryDraft };
      delete draft[meta.idField];
      const errors = validateComponent(artifact, kind, draft);
      if (errors.length) {
        this.libraryErrors = errors;
        return;
      }
      try {
        await this.library.create(kind, draft);
        this.libraryNotice = "Saved and sealed. Records are immutable; corrections create a new record.";
        await afterRecordsChanged(this);
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
        await this.library.remove(this.activeKind, itemId);
        this.libraryNotice = "";
        await afterRecordsChanged(this);
      } catch (err) {
        this.libraryErrors = [{ field: "*", message: String(err?.message ?? err) }];
      }
    },
  });
}

export const KEYS = ["libraryOpen", "librarySection", "sourceKind", "libraryTab", "libraryDraft", "libraryErrors", "libraryNotice", "libraryTabs", "identityTabs", "activeKind", "activeKindLabel", "canAuthorRecord", "canForkRecord", "libraryRecords", "librarySeedItems", "librarySeedCount", "libraryLoading", "libraryError", "libraryFields", "openLibrary", "closeLibrary", "selectLibrarySection", "selectSourceKind", "selectLibraryTab", "libraryItemId", "libraryItemTitle", "librarySeedItemTitle", "libraryFieldDisplay", "librarySetField", "newLibraryItem", "forkLibraryItem", "cancelLibraryItem", "saveLibraryItem", "deleteLibraryItem"];
