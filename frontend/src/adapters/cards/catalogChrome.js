// Generic catalog chrome: the shared partials address `draftDrawer`, `draftSearch`,
// … without knowing the collection prefix. Each is a proxy to the active
// collection's prefixed state/handler, so the per-prefix surface (and the card
// tests that use it) stays intact until the keys are derived.
const APPS = new WeakMap();
const CHROME = Symbol("catalogDraft.chrome");

export function registerCatalogEntry(app, entry) {
  const entries = APPS.get(app) ?? new Map();
  APPS.set(app, entries);
  entries.set(entry.nodeId, entry);
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
];

function activeEntry(app) {
  return APPS.get(app)?.get(app.draftNodeId) ?? null;
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

function installStateProxies(app) {
  for (const [suffix, fallback] of Object.entries(STATE_DEFAULTS)) {
    Object.defineProperty(app, `draft${suffix}`, {
      configurable: true,
      enumerable: true,
      get() {
        const entry = activeEntry(this);
        return entry ? this[`${entry.prefix}${suffix}`] : fallback();
      },
      set(value) {
        const entry = activeEntry(this);
        if (entry) this[`${entry.prefix}${suffix}`] = value;
      },
    });
  }
}

function installValueGetters(app) {
  for (const [suffix, fallback] of Object.entries(GETTER_DEFAULTS)) {
    Object.defineProperty(app, `draft${suffix}`, {
      configurable: true,
      enumerable: true,
      get() {
        const entry = activeEntry(this);
        return entry ? this[`${entry.prefix}${suffix}`] : fallback();
      },
    });
  }
}

function installDerivedGetters(app) {
  Object.defineProperties(app, {
    draftHasStandard: {
      configurable: true,
      enumerable: true,
      get() {
        return Boolean(activeEntry(this)?.standardField);
      },
    },
    draftAtLimit: {
      configurable: true,
      enumerable: true,
      get() {
        const entry = activeEntry(this);
        return entry?.canAdd ? !entry.canAdd(this) : false;
      },
    },
    draftEditorOpen: {
      configurable: true,
      enumerable: true,
      get() {
        const entry = activeEntry(this);
        return entry ? this[`${entry.prefix}EditorOpen`] : false;
      },
    },
    draftResultLabel: {
      configurable: true,
      enumerable: true,
      get() {
        const entry = activeEntry(this);
        return entry?.resultLabel ? entry.resultLabel(this) : "";
      },
    },
    draftSearchPlaceholder: {
      configurable: true,
      enumerable: true,
      get() {
        return activeEntry(this)?.searchPlaceholder ?? "Search…";
      },
    },
    draftEmptyMessage: {
      configurable: true,
      enumerable: true,
      get() {
        return activeEntry(this)?.emptyMessage ?? "No matching entries found.";
      },
    },
    draftEmptyDrilldownMessage: {
      configurable: true,
      enumerable: true,
      get() {
        return activeEntry(this)?.emptyDrilldownMessage ?? "No matching entries found.";
      },
    },
    draftCatalogFormOptions: {
      configurable: true,
      enumerable: true,
      get() {
        return activeEntry(this)?.catalogForm?.options?.() ?? [];
      },
    },
    draftCatalogForm: {
      configurable: true,
      enumerable: true,
      get() {
        return activeEntry(this)?.catalogForm?.value?.() ?? "";
      },
      set(value) {
        activeEntry(this)?.catalogForm?.set?.(value);
      },
    },
  });
}

function installMethods(app) {
  Object.assign(app, {
    openDraftSearch() {
      const entry = activeEntry(this);
      if (entry) this[`open${entry.Cap}Search`]();
    },
    toggleDraftSearchNotes() {
      const entry = activeEntry(this);
      if (entry) this[`toggle${entry.Cap}SearchNotes`]();
    },
    closeDraftDrawer() {
      const entry = activeEntry(this);
      if (entry) this[`close${entry.Cap}Drawer`]();
    },
    inspectDraftRow(ri) {
      const entry = activeEntry(this);
      if (entry) this[`inspect${entry.Cap}Row`](ri);
    },
    toggleDraftCategory(category) {
      const entry = activeEntry(this);
      if (entry) this[`toggle${entry.Cap}Category`](category);
    },
    toggleDraftFamily(family) {
      const entry = activeEntry(this);
      if (entry) this[`toggle${entry.Cap}Family`](family);
    },
    selectDraftStandard(standardId) {
      const entry = activeEntry(this);
      if (entry) this[`select${entry.Cap}Standard`](standardId);
    },
    clearDraftStandard() {
      const entry = activeEntry(this);
      if (entry) this[`clear${entry.Cap}Standard`]();
    },
    handleDraftEscape() {
      const entry = activeEntry(this);
      if (entry) this[`handle${entry.Cap}Escape`]();
    },
    addCatalogItem(catalogId) {
      const entry = activeEntry(this);
      if (entry) this[`addCatalog${entry.Cap}`](catalogId);
    },
    duplicateCatalogItem(catalogId) {
      const entry = activeEntry(this);
      if (entry) this[`duplicateCatalog${entry.Cap}`](catalogId);
    },
    draftItemMeta(item) {
      const entry = activeEntry(this);
      return entry ? this[`${entry.prefix}ItemMeta`](item) : "";
    },
    draftGroupMeta(group) {
      const entry = activeEntry(this);
      return entry ? this[`${entry.prefix}GroupMeta`](group) : "";
    },
    setDraftCatalogForm(value) {
      activeEntry(this)?.catalogForm?.set?.(value);
    },
  });
}

export function installChrome(app) {
  if (app[CHROME]) return;
  Object.defineProperty(app, CHROME, { value: true });
  installStateProxies(app);
  installValueGetters(app);
  installDerivedGetters(app);
  installMethods(app);
}
