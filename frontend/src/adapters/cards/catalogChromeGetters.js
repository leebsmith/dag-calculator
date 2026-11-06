// Catalog chrome getters and state proxies: the shared draft* surface resolves
// the active collection's prefixed member through the injected getView.

export const ENTRIES = Symbol("catalogChrome.entries");

export function registerCatalogEntry(app, entry) {
  // Keyed by a symbol on the app, never by the app's object identity: the
  // browser wraps the app in `Alpine.reactive`, so a WeakMap entry made against
  // the raw object is invisible to every handler (`this` is the proxy). Symbol
  // reads forward through the proxy to the same target.
  //
  // The property must be a normal (writable, configurable) data property.
  // @vue/reactivity returns an object value as a reactive proxy, and the JS
  // proxy invariant refuses that for a locked-down (non-configurable,
  // non-writable) data property: every read would throw and silently kill each
  // `draft*` binding. A plain assignment is proxy-safe; symbols stay invisible
  // to `Object.keys`, `for…in`, and JSON.
  if (!app[ENTRIES]) app[ENTRIES] = new Map();
  app[ENTRIES].set(entry.nodeId, entry);
}

export const CATALOG_CHROME_KEYS = [
  "draftDrawer",
  "draftSearch",
  "draftSearchNotes",
  "draftActiveIndex",
  "draftCategoryFilter",
  "draftFamily",
  "draftStandard",
  "openDraftSearch",
  "toggleDraftSearchNotes",
  "closeDraftDrawer",
  "inspectDraftRow",
  "toggleDraftCategory",
  "toggleDraftFamily",
  "selectDraftStandard",
  "clearDraftStandard",
  "handleDraftEscape",
  "addCatalogItem",
  "duplicateCatalogItem",
  "draftCatalog",
  "draftCategories",
  "draftFamilies",
  "draftStandardGroups",
  "draftProductMatches",
  "draftStandardName",
  "draftFilteredCatalog",
  "draftVisibleCatalog",
  "draftCatalogTruncated",
  "draftCounts",
  "draftActiveRow",
  "draftItemMeta",
  "draftGroupMeta",
  "draftHasStandard",
  "draftAtLimit",
  "draftEditorOpen",
  "draftResultLabel",
  "draftSearchPlaceholder",
  "draftEmptyMessage",
  "draftEmptyDrilldownMessage",
  "draftCatalogFormOptions",
  "draftCatalogForm",
  "setDraftCatalogForm",
  "draftDrawerId",
  "draftToolbarNote",
  "draftAddLabel",
  "draftInputStep",
  "draftTextColumns",
  "draftTableInspect",
  "draftTableClone",
  "draftEmptyText",
  "draftTotals",
  "draftRowBadge",
  "cloneDraftRow",
];

export function activeEntry(view) {
  return view[ENTRIES]?.get(view.draftNodeId) ?? null;
}

const STATE_DEFAULTS = {
  Drawer: () => null,
  Search: () => "",
  SearchNotes: () => false,
  ActiveIndex: () => null,
  CategoryFilter: () => [],
  Family: () => "",
  Standard: () => "",
};

const GETTER_DEFAULTS = {
  Catalog: () => [],
  Categories: () => [],
  Families: () => [],
  StandardGroups: () => [],
  ProductMatches: () => [],
  StandardName: () => "",
  FilteredCatalog: () => [],
  VisibleCatalog: () => [],
  CatalogTruncated: () => false,
  Counts: () => ({}),
  ActiveRow: () => null,
};

function stateProxies(getView) {
  const out = {};
  for (const [suffix, fallback] of Object.entries(STATE_DEFAULTS)) {
    out[`draft${suffix}`] = {
      configurable: true,
      enumerable: true,
      get() {
        const view = getView();
        const entry = activeEntry(view);
        return entry ? view[`${entry.prefix}${suffix}`] : fallback();
      },
      set(value) {
        const view = getView();
        const entry = activeEntry(view);
        if (entry) view[`${entry.prefix}${suffix}`] = value;
      },
    };
  }
  return out;
}

function valueGetters(getView) {
  const out = {};
  for (const [suffix, fallback] of Object.entries(GETTER_DEFAULTS)) {
    out[`draft${suffix}`] = {
      configurable: true,
      enumerable: true,
      get() {
        const view = getView();
        const entry = activeEntry(view);
        return entry ? view[`${entry.prefix}${suffix}`] : fallback();
      },
    };
  }
  return out;
}

function catalogueGetters(getView) {
  return {
    draftHasStandard: {
      configurable: true,
      enumerable: true,
      get() {
        return Boolean(activeEntry(getView())?.standardField);
      },
    },
    draftAtLimit: {
      configurable: true,
      enumerable: true,
      get() {
        const view = getView();
        const entry = activeEntry(view);
        return entry?.canAdd ? !entry.canAdd(view) : false;
      },
    },
    draftEditorOpen: {
      configurable: true,
      enumerable: true,
      get() {
        const view = getView();
        const entry = activeEntry(view);
        return entry ? view[`${entry.prefix}EditorOpen`] : false;
      },
    },
    draftResultLabel: {
      configurable: true,
      enumerable: true,
      get() {
        const view = getView();
        const entry = activeEntry(view);
        return entry?.resultLabel ? entry.resultLabel(view) : "";
      },
    },
    draftSearchPlaceholder: {
      configurable: true,
      enumerable: true,
      get() {
        return activeEntry(getView())?.searchPlaceholder ?? "Search…";
      },
    },
    draftEmptyMessage: {
      configurable: true,
      enumerable: true,
      get() {
        return activeEntry(getView())?.emptyMessage ?? "No matching entries found.";
      },
    },
    draftEmptyDrilldownMessage: {
      configurable: true,
      enumerable: true,
      get() {
        return activeEntry(getView())?.emptyDrilldownMessage ?? "No matching entries found.";
      },
    },
    draftCatalogFormOptions: {
      configurable: true,
      enumerable: true,
      get() {
        const view = getView();
        return activeEntry(view)?.catalogForm?.options?.(view) ?? [];
      },
    },
    draftCatalogForm: {
      configurable: true,
      enumerable: true,
      get() {
        const view = getView();
        return activeEntry(view)?.catalogForm?.value?.(view) ?? "";
      },
      set(value) {
        const view = getView();
        activeEntry(view)?.catalogForm?.set?.(value, view);
      },
    },
  };
}

function tableGetters(getView) {
  return {
    draftDrawerId: {
      configurable: true,
      enumerable: true,
      get() {
        return activeEntry(getView())?.drawerId ?? "";
      },
    },
    draftToolbarNote: {
      configurable: true,
      enumerable: true,
      get() {
        const view = getView();
        const note = activeEntry(view)?.toolbarNote;
        return typeof note === "function" ? note(view) : note ?? "";
      },
    },
    draftAddLabel: {
      configurable: true,
      enumerable: true,
      get() {
        return activeEntry(getView())?.addLabel ?? "";
      },
    },
    draftInputStep: {
      configurable: true,
      enumerable: true,
      get() {
        return activeEntry(getView())?.inputStep ?? 0.1;
      },
    },
    draftTextColumns: {
      configurable: true,
      enumerable: true,
      get() {
        return activeEntry(getView())?.textColumns ?? ["name"];
      },
    },
    draftTableInspect: {
      configurable: true,
      enumerable: true,
      get() {
        return activeEntry(getView())?.canInspect !== false;
      },
    },
    draftTableClone: {
      configurable: true,
      enumerable: true,
      get() {
        return activeEntry(getView())?.canClone === true;
      },
    },
    draftEmptyText: {
      configurable: true,
      enumerable: true,
      get() {
        return activeEntry(getView())?.emptyText ?? "";
      },
    },
    draftTotals: {
      configurable: true,
      enumerable: true,
      get() {
        const view = getView();
        const entry = activeEntry(view);
        return entry?.totals ? entry.totals(view) : { label: "", value: "" };
      },
    },
  };
}


export function chromeState(getView) {
  return stateProxies(getView);
}

export function chromeGetters(getView) {
  return {
    ...valueGetters(getView),
    ...catalogueGetters(getView),
    ...tableGetters(getView),
  };
}
