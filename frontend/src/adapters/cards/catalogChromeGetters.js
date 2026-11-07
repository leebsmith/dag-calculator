// Catalog chrome getters and state proxies: the shared draft* surface resolves
// the active collection's prefixed member through the injected getView.

// The entry registry is a plain closure map, created once per app by the card
// composition root. It never becomes an app member: the browser's reactive proxy
// cannot then trap a symbol store, and the chrome reads the current entry through
// `draftNodeId` at call time.
export function createCatalogRegistry() {
  const entries = new Map();
  return {
    register(entry) {
      entries.set(entry.nodeId, entry);
    },
    get(nodeId) {
      return entries.get(nodeId) ?? null;
    },
  };
}

export function activeEntry(registry, view) {
  return view.draftNodeId ? registry.get(view.draftNodeId) : null;
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

function stateProxies(getView, registry) {
  const out = {};
  for (const [suffix, fallback] of Object.entries(STATE_DEFAULTS)) {
    out[`draft${suffix}`] = {
      configurable: true,
      enumerable: true,
      get() {
        const view = getView();
        const entry = activeEntry(registry, view);
        return entry ? view[`${entry.prefix}${suffix}`] : fallback();
      },
      set(value) {
        const view = getView();
        const entry = activeEntry(registry, view);
        if (entry) view[`${entry.prefix}${suffix}`] = value;
      },
    };
  }
  return out;
}

function valueGetters(getView, registry) {
  const out = {};
  for (const [suffix, fallback] of Object.entries(GETTER_DEFAULTS)) {
    out[`draft${suffix}`] = {
      configurable: true,
      enumerable: true,
      get() {
        const view = getView();
        const entry = activeEntry(registry, view);
        return entry ? view[`${entry.prefix}${suffix}`] : fallback();
      },
    };
  }
  return out;
}

function catalogueGetters(getView, registry) {
  return {
    draftHasStandard: {
      configurable: true,
      enumerable: true,
      get() {
        return Boolean(activeEntry(registry, getView())?.standardField);
      },
    },
    draftAtLimit: {
      configurable: true,
      enumerable: true,
      get() {
        const view = getView();
        const entry = activeEntry(registry, view);
        return entry?.canAdd ? !entry.canAdd(view) : false;
      },
    },
    draftEditorOpen: {
      configurable: true,
      enumerable: true,
      get() {
        const view = getView();
        const entry = activeEntry(registry, view);
        return entry ? view[`${entry.prefix}EditorOpen`] : false;
      },
    },
    draftResultLabel: {
      configurable: true,
      enumerable: true,
      get() {
        const view = getView();
        const entry = activeEntry(registry, view);
        return entry?.resultLabel ? entry.resultLabel(view) : "";
      },
    },
    draftSearchPlaceholder: {
      configurable: true,
      enumerable: true,
      get() {
        return activeEntry(registry, getView())?.searchPlaceholder ?? "Search…";
      },
    },
    draftEmptyMessage: {
      configurable: true,
      enumerable: true,
      get() {
        return activeEntry(registry, getView())?.emptyMessage ?? "No matching entries found.";
      },
    },
    draftEmptyDrilldownMessage: {
      configurable: true,
      enumerable: true,
      get() {
        return activeEntry(registry, getView())?.emptyDrilldownMessage ?? "No matching entries found.";
      },
    },
    draftCatalogFormOptions: {
      configurable: true,
      enumerable: true,
      get() {
        const view = getView();
        return activeEntry(registry, view)?.catalogForm?.options?.(view) ?? [];
      },
    },
    draftCatalogForm: {
      configurable: true,
      enumerable: true,
      get() {
        const view = getView();
        return activeEntry(registry, view)?.catalogForm?.value?.(view) ?? "";
      },
      set(value) {
        const view = getView();
        activeEntry(registry, view)?.catalogForm?.set?.(value, view);
      },
    },
  };
}

function tableGetters(getView, registry) {
  return {
    draftDrawerId: {
      configurable: true,
      enumerable: true,
      get() {
        return activeEntry(registry, getView())?.drawerId ?? "";
      },
    },
    draftToolbarNote: {
      configurable: true,
      enumerable: true,
      get() {
        const view = getView();
        const note = activeEntry(registry, view)?.toolbarNote;
        return typeof note === "function" ? note(view) : note ?? "";
      },
    },
    draftAddLabel: {
      configurable: true,
      enumerable: true,
      get() {
        return activeEntry(registry, getView())?.addLabel ?? "";
      },
    },
    draftInputStep: {
      configurable: true,
      enumerable: true,
      get() {
        return activeEntry(registry, getView())?.inputStep ?? 0.1;
      },
    },
    draftTextColumns: {
      configurable: true,
      enumerable: true,
      get() {
        return activeEntry(registry, getView())?.textColumns ?? ["name"];
      },
    },
    draftTableInspect: {
      configurable: true,
      enumerable: true,
      get() {
        return activeEntry(registry, getView())?.canInspect !== false;
      },
    },
    draftTableClone: {
      configurable: true,
      enumerable: true,
      get() {
        return activeEntry(registry, getView())?.canClone === true;
      },
    },
    draftEmptyText: {
      configurable: true,
      enumerable: true,
      get() {
        return activeEntry(registry, getView())?.emptyText ?? "";
      },
    },
    draftTotals: {
      configurable: true,
      enumerable: true,
      get() {
        const view = getView();
        const entry = activeEntry(registry, view);
        return entry?.totals ? entry.totals(view) : { label: "", value: "" };
      },
    },
  };
}


export function chromeState(getView, registry) {
  return stateProxies(getView, registry);
}

export function chromeGetters(getView, registry) {
  return {
    ...valueGetters(getView, registry),
    ...catalogueGetters(getView, registry),
    ...tableGetters(getView, registry),
  };
}
