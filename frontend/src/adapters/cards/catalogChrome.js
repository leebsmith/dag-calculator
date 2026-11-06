// Generic catalog chrome: the shared partials address `draftDrawer`, `draftSearch`,
// … without knowing the collection prefix. Each is a proxy to the active
// collection's prefixed state/handler, so the per-prefix surface (and the card
// tests that use it) stays intact until the keys are derived.

import { activeEntry, chromeGetters, chromeState } from "./catalogChromeGetters.js";

export { CATALOG_CHROME_KEYS, registerCatalogEntry } from "./catalogChromeGetters.js";

const CHROME = Symbol("catalogDraft.chrome");

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

function drawerMethods(getView) {
  return {
    openDraftSearch() {
      const view = getView();
      const entry = activeEntry(view);
      if (entry) view[`open${entry.Cap}Search`]();
    },
    toggleDraftSearchNotes() {
      const view = getView();
      const entry = activeEntry(view);
      if (entry) view[`toggle${entry.Cap}SearchNotes`]();
    },
    closeDraftDrawer() {
      const view = getView();
      const entry = activeEntry(view);
      if (entry) view[`close${entry.Cap}Drawer`]();
    },
    inspectDraftRow(ri) {
      const view = getView();
      const entry = activeEntry(view);
      if (entry) view[`inspect${entry.Cap}Row`](ri);
    },
    toggleDraftCategory(category) {
      const view = getView();
      const entry = activeEntry(view);
      if (entry) view[`toggle${entry.Cap}Category`](category);
    },
    toggleDraftFamily(family) {
      const view = getView();
      const entry = activeEntry(view);
      if (entry) view[`toggle${entry.Cap}Family`](family);
    },
    selectDraftStandard(standardId) {
      const view = getView();
      const entry = activeEntry(view);
      if (entry) view[`select${entry.Cap}Standard`](standardId);
    },
    clearDraftStandard() {
      const view = getView();
      const entry = activeEntry(view);
      if (entry) view[`clear${entry.Cap}Standard`]();
    },
    handleDraftEscape() {
      const view = getView();
      const entry = activeEntry(view);
      if (entry) view[`handle${entry.Cap}Escape`]();
    },
  };
}

function contentMethods(getView) {
  return {
    addCatalogItem(catalogId) {
      const view = getView();
      const entry = activeEntry(view);
      if (entry) view[`addCatalog${entry.Cap}`](catalogId);
    },
    duplicateCatalogItem(catalogId) {
      const view = getView();
      const entry = activeEntry(view);
      if (entry) view[`duplicateCatalog${entry.Cap}`](catalogId);
    },
    draftItemMeta(item) {
      const view = getView();
      const entry = activeEntry(view);
      return entry ? view[`${entry.prefix}ItemMeta`](item) : "";
    },
    draftGroupMeta(group) {
      const view = getView();
      const entry = activeEntry(view);
      return entry ? view[`${entry.prefix}GroupMeta`](group) : "";
    },
    draftRowBadge(row, columnId) {
      const view = getView();
      const entry = activeEntry(view);
      return entry?.rowBadge ? entry.rowBadge(view, row, columnId) : null;
    },
    cloneDraftRow(ri) {
      const view = getView();
      const entry = activeEntry(view);
      if (entry?.cloneRow) entry.cloneRow(view, ri);
    },
    setDraftCatalogForm(value) {
      const view = getView();
      activeEntry(view)?.catalogForm?.set?.(value, view);
    },
  };
}

export function createCatalogChrome(getView) {
  return {
    state: chromeState(getView),
    getters: chromeGetters(getView),
    methods: { ...drawerMethods(getView), ...contentMethods(getView) },
  };
}

export function installChrome(app, getView = () => app) {
  if (app[CHROME]) return;
  Object.defineProperty(app, CHROME, { value: true });
  const { state, getters, methods } = createCatalogChrome(getView);
  Object.defineProperties(app, state);
  Object.defineProperties(app, getters);
  Object.assign(app, methods);
}
