// Record-library surface: administration only. Two sections — Sources (the
// identity sources a batch is built from) and Ingredients (the step-local
// formulation records). Records are immutable: create/delete, and a style is
// forked before it is edited. Records live on the server via store/library.js;
// this adapter only owns view state and the write actions.
//
// Selection never happens here: pickers read the reference cache. The Library
// never references a batch.

import { CATALOGS, IDENTITY_KINDS, validateComponent } from "../store/userCatalog.js";
import { attenuationRangeOf, createLibraryFields, KEYS as libraryFieldKeys } from "./libraryFields.js";
import { createLibraryFieldEditor, KEYS as fieldEditorKeys } from "./libraryFieldEditor.js";
import { createLibrarySeedActions, KEYS as seedActionKeys } from "./librarySeedActions.js";
import { createLibraryListEditor, KEYS as libraryListKeys } from "./libraryListEditor.js";
import { createLibraryComposition, KEYS as compositionKeys } from "./libraryComposition.js";
import { filterCatalog } from "../views/catalog.js";

function tabList(kinds) {
  return kinds.map((id) => ({ id, label: CATALOGS[id].label }));
}

function identityOf(meta, item) {
  return item?.[meta?.idField] ?? item?.id ?? "";
}

function titleOf(meta, item) {
  return item?.[meta?.titleField ?? "name"] ?? identityOf(meta, item);
}

function libraryErrorsFrom(err) {
  return (
    err?.details?.errors?.map((message) => ({ field: "*", message })) ??
    err?.errors ??
    [{ field: "*", message: String(err?.message ?? err) }]
  );
}

function yeastCapError(draft) {
  const range = attenuationRangeOf(draft);
  if (!range || draft.attenuation_cap_pct === range.high) return null;
  return {
    field: "attenuation_cap_pct",
    message: "Cap must equal the published high when a range is set.",
  };
}

export function createLibraryUi({ artifact, cache, getView, modalFocus }) {

  const actions = {
    libraryOpen: false,
    librarySection: "sources", // "sources" | "ingredients"
    sourceKind: "style",
    librarySearch: "",
    librarySearchNotes: false,
    librarySeedLimit: 50,
    libraryTab: "malt",
    libraryDraft: null,
    libraryCloneOf: "",
    libraryErrors: [],
    libraryNotice: "",
  };

  Object.defineProperties(actions, {
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
        return getView().librarySection === "sources" ? getView().sourceKind : getView().libraryTab;
      },
    },
    activeKindHasNotes: {
      configurable: true,
      get() {
        return Boolean(getView().activeSchema?.notes);
      },
    },
    librarySearchFields: {
      configurable: true,
      get() {
        const meta = CATALOGS[getView().activeKind];
        const fields = [meta?.titleField ?? "name"];
        if (getView().activeKind === "water_report") fields.push("source_name", "report_id");
        if (getView().activeKindHasNotes) fields.push("notes");
        return fields;
      },
    },
    libraryRecords: {
      configurable: true,
      get() {
        void getView().libraryRevision;
        return filterCatalog(getView().library.list(getView().activeKind), {
          query: getView().librarySearch,
          searchFields: getView().librarySearchFields,
          includeNotes: getView().librarySearchNotes,
        });
      },
    },
    librarySeedItems: {
      configurable: true,
      get() {
        void getView().libraryRevision;
        const meta = CATALOGS[getView().activeKind];
        const seeds = cache.seeds[meta?.seedKey] ?? {};
        return filterCatalog(Object.values(seeds), {
          query: getView().librarySearch,
          searchFields: getView().librarySearchFields,
          includeNotes: getView().librarySearchNotes,
        }).slice(0, getView().librarySeedLimit ?? 50);
      },
    },
    librarySeedCount: {
      configurable: true,
      get() {
        void getView().libraryRevision;
        const meta = CATALOGS[getView().activeKind];
        const seeds = cache.seeds[meta?.seedKey] ?? {};
        return filterCatalog(Object.values(seeds), {
          query: getView().librarySearch,
          searchFields: getView().librarySearchFields,
          includeNotes: getView().librarySearchNotes,
        }).length;
      },
    },
    libraryLoading: {
      configurable: true,
      get() {
        void getView().libraryRevision;
        return getView().library.loading();
      },
    },
    libraryError: {
      configurable: true,
      get() {
        void getView().libraryRevision;
        return getView().library.error();
      },
    },
    // Styles are forked, never authored from scratch: a custom style starts as a
    // copy of an existing declaration.
    canAuthorRecord: {
      configurable: true,
      get() {
        return getView().activeKind !== "style";
      },
    },
    canForkRecord: {
      configurable: true,
      get() {
        return getView().activeKind === "style";
      },
    },
    canCloneRecord: {
      configurable: true,
      get() {
        return getView().activeKind !== "style";
      },
    },
    librarySearchLabel: {
      configurable: true,
      get() {
        const label = CATALOGS[getView().activeKind]?.label ?? getView().activeKind;
        return `Filter ${String(label).toLowerCase()} records and bundled seeds`;
      },
    },
    libraryEditorTitle: {
      configurable: true,
      get() {
        if (!getView().libraryDraft) return "";
        if (getView().libraryDraft.forked_from_name) {
          return `Forked ${getView().activeKindLabel.toLowerCase()}`;
        }
        if (getView().libraryCloneOf) return `Clone of ${getView().libraryCloneOf}`;
        return `New ${getView().activeKindLabel.toLowerCase()}`;
      },
    },
    activeKindLabel: {
      configurable: true,
      get() {
        return CATALOGS[getView().activeKind]?.label ?? getView().activeKind;
      },
    },
  });

  async function afterRecordsChanged(store) {
    store.libraryDraft = null;
    store.libraryErrors = [];
    await store.refreshLibraryItems();
  }

  Object.assign(actions, {
    openLibrary(kind) {
      if (kind && IDENTITY_KINDS.includes(kind)) {
        getView().librarySection = "sources";
        getView().sourceKind = kind;
      } else if (kind && CATALOGS[kind]) {
        getView().librarySection = "ingredients";
        getView().libraryTab = kind;
      }
      getView().libraryOpen = true;
      getView().libraryDraft = null;
      getView().libraryErrors = [];
      getView().libraryNotice = "";
      getView().librarySearch = "";
      getView().librarySearchNotes = false;
      if (!getView().library.loaded() && !getView().library.loading()) {
        getView().library.refresh().then(() => getView().refreshLibraryItems());
      }
    },

    // Catalogue reads for surfaces outside the editor — the import ledger's chips
    // and search. They hit the reference cache the engine and the pickers use, so a
    // record authored a moment ago (a blend yeast, a house malt) is visible there;
    // the setup store's private cache never receives ingredient records.
    catalogItems(kind) {
      const meta = CATALOGS[kind];
      if (!meta) return [];
      const map = meta.seedKey ? cache.seeds[meta.seedKey] : cache.references[meta.referencesKey];
      return Object.values(map ?? {});
    },

    catalogItem(kind, id) {
      const meta = CATALOGS[kind];
      if (!meta || !id) return null;
      return cache.seeds[meta.seedKey]?.[id] ?? cache.references[meta.referencesKey]?.[id] ?? null;
    },

    // The reference maps a boundary build reads. The gate solves against the same
    // set the commit will load, so a user record cannot pass the gate and then fail
    // to resolve in the batch.
    referenceSnapshot() {
      return cache.references;
    },

    closeLibrary() {
      getView().libraryOpen = false;
      modalFocus.dialogRestore();
      getView().libraryDraft = null;
      getView().libraryErrors = [];
      getView().libraryNotice = "";
    },

    selectLibrarySection(section) {
      if (section !== "sources" && section !== "ingredients") return;
      getView().librarySection = section;
      getView().librarySearch = "";
      getView().librarySearchNotes = false;
      getView().librarySeedLimit = 50;
      getView().libraryDraft = null;
      getView().libraryCloneOf = "";
      getView().libraryErrors = [];
      getView().libraryNotice = "";
    },

    selectSourceKind(kind) {
      if (!IDENTITY_KINDS.includes(kind)) return;
      getView().librarySection = "sources";
      getView().sourceKind = kind;
      getView().librarySearch = "";
      getView().librarySearchNotes = false;
      getView().librarySeedLimit = 50;
      getView().libraryDraft = null;
      getView().libraryCloneOf = "";
      getView().libraryErrors = [];
      getView().libraryNotice = "";
    },

    selectLibraryTab(id) {
      if (!CATALOGS[id] || IDENTITY_KINDS.includes(id)) return;
      getView().librarySection = "ingredients";
      getView().libraryTab = id;
      getView().librarySearch = "";
      getView().librarySearchNotes = false;
      getView().librarySeedLimit = 50;
      getView().libraryDraft = null;
      getView().libraryCloneOf = "";
      getView().libraryErrors = [];
      getView().libraryNotice = "";
    },

    librarySetSearch(value) {
      getView().librarySearch = value;
      getView().librarySeedLimit = 50;
    },

    showMoreSeeds() {
      getView().librarySeedLimit = (getView().librarySeedLimit ?? 50) + 50;
    },

    toggleLibrarySearchNotes() {
      getView().librarySearchNotes = !getView().librarySearchNotes;
    },

    libraryItemId(item) {
      return identityOf(CATALOGS[getView().activeKind], item);
    },

    libraryItemTitle(item) {
      return titleOf(CATALOGS[getView().activeKind], item);
    },

    librarySeedItemTitle(item) {
      const meta = CATALOGS[getView().activeKind];
      return titleOf(meta, item);
    },

    newLibraryItem() {
      if (!getView().canAuthorRecord) return;
      getView().libraryDraft = {};
      getView().libraryCloneOf = "";
      getView().libraryErrors = [];
      getView().libraryNotice = "";
    },

    cancelLibraryItem() {
      getView().libraryDraft = null;
      getView().libraryCloneOf = "";
      getView().libraryErrors = [];
    },

    async saveLibraryItem() {
      if (!getView().libraryDraft) return;
      const kind = getView().activeKind;
      const meta = CATALOGS[kind];
      getView().librarySortPoints();
      const draft = { ...getView().libraryDraft };
      delete draft[meta.idField];
      const capError = kind === "yeast" ? yeastCapError(draft) : null;
      if (capError) {
        getView().libraryErrors = [capError];
        return;
      }
      const errors = validateComponent(artifact, kind, draft);
      if (errors.length) {
        getView().libraryErrors = errors;
        return;
      }
      try {
        await getView().library.create(kind, draft);
        getView().libraryDraft = null;
        getView().libraryCloneOf = "";
        getView().libraryNotice = "Saved and sealed. Records are immutable; corrections create a new record.";
        await afterRecordsChanged(getView());
      } catch (err) {
        getView().libraryErrors = libraryErrorsFrom(err);
      }
    },

    async deleteLibraryItem(itemId) {
      if (!itemId) return;
      if (typeof window !== "undefined" && !window.confirm(
        "Delete this record permanently? Existing batches keep their copies; new batches cannot select it."
      )) {
        return;
      }
      try {
        await getView().library.remove(getView().activeKind, itemId);
        getView().libraryNotice = "";
        await afterRecordsChanged(getView());
      } catch (err) {
        getView().libraryErrors = [{ field: "*", message: String(err?.message ?? err) }];
      }
    },
  });
  return actions;
}

export function createLibraryLayers(ctx) {
  return [
    createLibraryFields(ctx), createLibraryFieldEditor(ctx),
    createLibraryListEditor(ctx),
    createLibraryComposition(ctx),
    createLibrarySeedActions({
      getView: ctx.getView,
      titleOf,
      identityOf,
      Catalog: CATALOGS,
    }),
    createLibraryUi(ctx),
  ];
}



export const KEYS = [
  ...compositionKeys,
  "catalogItems", "catalogItem", "referenceSnapshot", "libraryOpen", "librarySection", "sourceKind", "librarySearch", "librarySearchNotes", "librarySeedLimit", "librarySetSearch", "showMoreSeeds", "toggleLibrarySearchNotes", "activeKindHasNotes", "librarySearchFields", "librarySearchLabel", "libraryTab", "libraryDraft", "libraryCloneOf", "libraryErrors", "libraryNotice", "libraryEditorTitle", "libraryTabs", "identityTabs", "activeKind", "activeKindLabel", "canAuthorRecord", "canForkRecord", "canCloneRecord", "libraryRecords", "librarySeedItems", "librarySeedCount", "libraryLoading", "libraryError", "openLibrary", "closeLibrary", "selectLibrarySection", "selectSourceKind", "selectLibraryTab", "libraryItemId", "libraryItemTitle", "librarySeedItemTitle", "newLibraryItem", "cancelLibraryItem", "saveLibraryItem", "deleteLibraryItem", ...seedActionKeys, ...fieldEditorKeys, ...libraryFieldKeys, ...libraryListKeys];
