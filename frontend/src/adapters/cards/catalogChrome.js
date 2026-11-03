// Generic catalog chrome: the shared partials address `draftDrawer`, `draftSearch`,
// … without knowing the collection prefix. Each is a proxy to the active
// collection's prefixed state/handler, so the per-prefix surface (and the card
// tests that use it) stays intact until the keys are derived.
const CHROME_DEFAULTS = {
  catalogForm: null,
  resultLabel: null,
  searchPlaceholder: "Search…",
  emptyMessage: "No matching entries found.",
  emptyDrilldownMessage: "No matching entries found.",
  drawerId: null,
  toolbarNote: "",
  addLabel: "＋ Add from Catalog",
  inputStep: 0.1,
  textColumns: ["name"],
  canInspect: true,
  canClone: false,
  cloneRow: null,
  emptyText: "No rows in the draft.",
  totals: null,
  rowBadge: null,
};

export function chromeConfig(config) {
  const out = {};
  for (const [key, fallback] of Object.entries(CHROME_DEFAULTS)) {
    out[key] = config[key] === undefined ? fallback : config[key];
  }
  return out;
}

const ENTRIES = Symbol("catalogChrome.entries");
const CHROME = Symbol("catalogDraft.chrome");

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

function activeEntry(app) {
  return app[ENTRIES]?.get(app.draftNodeId) ?? null;
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

function installCatalogueGetters(app) {
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
        return activeEntry(this)?.catalogForm?.options?.(this) ?? [];
      },
    },
    draftCatalogForm: {
      configurable: true,
      enumerable: true,
      get() {
        return activeEntry(this)?.catalogForm?.value?.(this) ?? "";
      },
      set(value) {
        activeEntry(this)?.catalogForm?.set?.(value, this);
      },
    },
  });
}

function installTableGetters(app) {
  Object.defineProperties(app, {
    draftDrawerId: {
      configurable: true,
      enumerable: true,
      get() {
        return activeEntry(this)?.drawerId ?? "";
      },
    },
    draftToolbarNote: {
      configurable: true,
      enumerable: true,
      get() {
        const note = activeEntry(this)?.toolbarNote;
        return typeof note === "function" ? note(this) : note ?? "";
      },
    },
    draftAddLabel: {
      configurable: true,
      enumerable: true,
      get() {
        return activeEntry(this)?.addLabel ?? "";
      },
    },
    draftInputStep: {
      configurable: true,
      enumerable: true,
      get() {
        return activeEntry(this)?.inputStep ?? 0.1;
      },
    },
    draftTextColumns: {
      configurable: true,
      enumerable: true,
      get() {
        return activeEntry(this)?.textColumns ?? ["name"];
      },
    },
    draftTableInspect: {
      configurable: true,
      enumerable: true,
      get() {
        return activeEntry(this)?.canInspect !== false;
      },
    },
    draftTableClone: {
      configurable: true,
      enumerable: true,
      get() {
        return activeEntry(this)?.canClone === true;
      },
    },
    draftEmptyText: {
      configurable: true,
      enumerable: true,
      get() {
        return activeEntry(this)?.emptyText ?? "";
      },
    },
    draftTotals: {
      configurable: true,
      enumerable: true,
      get() {
        const entry = activeEntry(this);
        return entry?.totals ? entry.totals(this) : { label: "", value: "" };
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
    draftRowBadge(row, columnId) {
      const entry = activeEntry(this);
      return entry?.rowBadge ? entry.rowBadge(this, row, columnId) : null;
    },
    cloneDraftRow(ri) {
      const entry = activeEntry(this);
      if (entry?.cloneRow) entry.cloneRow(this, ri);
    },
    setDraftCatalogForm(value) {
      activeEntry(this)?.catalogForm?.set?.(value, this);
    },
  });
}

export function installChrome(app) {
  if (app[CHROME]) return;
  Object.defineProperty(app, CHROME, { value: true });
  installStateProxies(app);
  installValueGetters(app);
  installCatalogueGetters(app);
  installTableGetters(app);
  installMethods(app);
}
