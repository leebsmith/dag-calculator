// User catalog CRUD surface: a generic, schema-driven editor for user-authored
// items, mounted in the menu bar. Each catalog renders an input per declared
// primitive_schema field (excluding the identity field), driven by the same
// schema the seeds conform to — no bespoke per-catalog templates.

import { CATALOGS } from "../store/userCatalog.js";

function buildTabs() {
  return Object.entries(CATALOGS).map(([id, meta]) => ({ id, label: meta.label }));
}

export function registerUserCatalogUi(app, ctx) {
  const { artifact } = ctx;

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
            const kind = spec.dimension ? "number" : spec.taxonomy ? "select" : "text";
            const scale = spec.dimension === "percentage" ? 100 : 1;
            const options = spec.taxonomy ? artifact.taxonomies?.[spec.taxonomy] ?? [] : null;
            return { field, label: field, kind, scale, options };
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
      return spec?.kind === "number" && spec.scale !== 1 ? value * spec.scale : value;
    },

    userSetField(field, value) {
      const spec = this.userCatalogFields.find((f) => f.field === field);
      const next = { ...this.userCatalogDraft };
      if (value === "") {
        delete next[field];
      } else if (spec?.kind === "number") {
        const n = Number(value);
        next[field] = Number.isFinite(n) ? n / spec.scale : 0;
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
