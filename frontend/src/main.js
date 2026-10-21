import Alpine from "alpinejs";

import { createStepApp } from "./adapters/stepAdapter.js";
import { setTokenProvider } from "./adapters/apiClient.js";
import { getSession } from "./adapters/authClient.js";
import * as libraryClient from "./adapters/libraryClient.js";
import {
  getIdToken,
  getRedirectResult,
  onAuthStateChanged,
  signInWithGoogle,
  signOut,
} from "./firebase.js";
import * as persistence from "./store/persistence.js";
import {
  FREEZE_RAIL_LIMIT,
  draftBatches,
  draftSections,
  formatDate,
  frozenBatches,
  recentFreezes,
  trashedBatches,
} from "./store/recipeList.js";

setTokenProvider(getIdToken);

// Anchor a fixed-position popover under (or above) its trigger. Fixed
// positioning keeps menus out of the chooser body's scroll clipping.
function anchorStyle(event) {
  const rect = event.currentTarget.getBoundingClientRect();
  const above = rect.bottom > window.innerHeight / 2;
  const right = Math.max(0, Math.round(window.innerWidth - rect.right));
  const vertical = above
    ? `bottom:${Math.round(window.innerHeight - rect.top + 4)}px`
    : `top:${Math.round(rect.bottom + 4)}px`;
  return `right:${right}px; ${vertical}`;
}

Alpine.store("auth", {
  user: null,
  loading: true,
  blocked: false,
  blockedEmail: "",
  sessionError: false,
  signIn: () => signInWithGoogle(),
  signOut: () => signOut(),
});

Alpine.store("recipes", {
  view: "chooser", // "chooser" | "freezes" | "editor"
  trashView: false,
  batches: [],
  activeId: null,
  activeName: "",
  loadError: false,
  saveState: "idle", // "idle" | "dirty" | "saving" | "error" | "conflict"
  conflictRemote: null,
  sort: "modified", // "modified" | "title"
  sortOpen: false,
  sortMenuStyle: "",
  rowMenu: null,
  rowMenuStyle: "",
  renamingId: null,
  renameValue: "",

  get visible() {
    return this.batches.filter((b) => (b.trashed ?? false) === this.trashView);
  },

  get drafts() {
    return draftBatches(this.batches);
  },

  get freezes() {
    return frozenBatches(this.batches);
  },

  get recentFreezeRail() {
    return recentFreezes(this.batches, FREEZE_RAIL_LIMIT);
  },

  get sections() {
    return draftSections(this.batches, { sort: this.sort });
  },

  get trashRows() {
    return trashedBatches(this.batches);
  },

  get sortLabel() {
    return this.sort === "title" ? "Title" : "Last modified";
  },

  dateLabel(seconds) {
    return formatDate(seconds);
  },

  syncActive() {
    const active = persistence.getActive();
    this.activeId = active?.id ?? null;
    this.activeName = active?.name ?? "";
  },

  async refresh() {
    this.batches = await persistence.list();
    this.loadError = false;
    this.syncActive();
  },

  async retryLoad() {
    try {
      await this.refresh();
    } catch {
      this.loadError = true;
    }
  },

  toggleSort(event) {
    this.closeRowMenu();
    if (this.sortOpen) {
      this.sortOpen = false;
      return;
    }
    this.sortMenuStyle = anchorStyle(event);
    this.sortOpen = true;
  },

  closeSort() {
    this.sortOpen = false;
  },

  setSort(sort) {
    if (sort === "modified" || sort === "title") this.sort = sort;
    this.sortOpen = false;
  },

  openRowMenu(batch, event) {
    this.sortOpen = false;
    if (this.rowMenu?.id === batch.id) {
      this.rowMenu = null;
      return;
    }
    this.rowMenuStyle = anchorStyle(event);
    this.rowMenu = batch;
  },

  closeRowMenu() {
    this.rowMenu = null;
  },

  async forkRow() {
    const batch = this.rowMenu;
    this.closeRowMenu();
    if (batch) await this.forkFrozen(batch.id);
  },

  beginRename(batch) {
    this.closeRowMenu();
    this.renamingId = batch.id;
    this.renameValue = batch.name;
  },

  startRename() {
    const batch = this.rowMenu;
    this.closeRowMenu();
    if (batch) this.beginRename(batch);
  },

  cancelRename() {
    this.renamingId = null;
  },

  setRenameValue(value) {
    this.renameValue = value;
  },

  async commitRename(batch) {
    if (this.renamingId !== batch.id) return;
    const name = this.renameValue.trim();
    this.renamingId = null;
    if (!name || name === batch.name) return;
    try {
      await persistence.renameBatch(batch.id, name);
      await this.refresh();
    } catch (err) {
      console.error("rename failed", err);
    }
  },

  async trashRow() {
    const batch = this.rowMenu;
    this.closeRowMenu();
    if (!batch) return;
    try {
      await persistence.trashBatch(batch.id);
      await this.refresh();
    } catch (err) {
      console.error("trash failed", err);
    }
  },

  showFreezes() {
    this.closeRowMenu();
    this.closeSort();
    this.trashView = false;
    this.view = "freezes";
  },

  showRecipes() {
    this.trashView = false;
  },

  keepMine() {
    return persistence.saveNow({ force: true });
  },

  reloadFromRemote() {
    return persistence.resolveConflictByReload();
  },

  retrySave() {
    return persistence.saveNow();
  },

  async newRecipe() {
    await persistence.createUntitled();
    this.trashView = false;
    this.view = "editor";
    await this.refresh();
    this.syncActive();
  },

  async openDraft(id) {
    await persistence.open(id);
    this.trashView = false;
    this.view = "editor";
    this.syncActive();
  },

  async forkFrozen(id) {
    await persistence.fork(id);
    this.trashView = false;
    this.view = "editor";
    await this.refresh();
    this.syncActive();
  },

  async rename(name) {
    await persistence.renameActive(name);
    this.syncActive();
  },

  async backToChooser() {
    await persistence.flushSave();
    await this.refresh();
    this.renamingId = null;
    this.sortOpen = false;
    this.trashView = false;
    this.view = "chooser";
    this.syncActive();
  },

  async openTrash() {
    await persistence.flushSave();
    await this.refresh();
    this.renamingId = null;
    this.sortOpen = false;
    this.trashView = true;
    this.view = "chooser";
    this.syncActive();
  },

  async trash() {
    await persistence.trashActive();
    await this.refresh();
    this.view = "chooser";
    this.syncActive();
  },

  async restore(id) {
    await persistence.restore(id);
    await this.refresh();
  },

  async deletePermanent(id) {
    await persistence.deletePermanent(id);
    await this.refresh();
  },

  async freeze() {
    await persistence.freezeActive();
    await this.refresh();
  },
});

// Mirror the persistence save-state into the reactive recipes store so the
// editor badge re-renders when autosave transitions (idle/dirty/saving/...).
persistence.setStateObserver(({ state, conflictRemote }) => {
  const recipes = Alpine.store("recipes");
  recipes.saveState = state;
  recipes.conflictRemote = conflictRemote;
});

// --- Auth-owned boot ---------------------------------------------------------
// The authenticated shell (`.app-content`) is gated on `$store.auth.user` with
// `x-if`, so nothing compiles or solves before sign-in. On sign-in we land on
// the recipe chooser; the editor is entered only via New/Open/Fork (each loads
// state). The user is published only AFTER the list is fetched, so the chooser
// never paints with stale/empty state.
let stepApp = null;
let latestUser; // undefined until the first auth callback
let legacyLibraryImported = false;

async function applyAuth(user) {
  const auth = Alpine.store("auth");
  const recipes = Alpine.store("recipes");

  if (!user) {
    stepApp?.teardown();
    persistence.clearActive();
    recipes.batches = [];
    recipes.activeId = null;
    recipes.activeName = "";
    recipes.view = "chooser";
    recipes.trashView = false;
    recipes.sortOpen = false;
    recipes.rowMenu = null;
    recipes.renamingId = null;
    auth.user = null;
    auth.loading = false;
    return;
  }

  if (!stepApp) return;

  auth.loading = true;
  let session;
  try {
    session = await getSession();
  } catch (err) {
    console.error("session check failed", err);
    auth.sessionError = true;
    auth.blocked = false;
    auth.user = null;
    auth.loading = false;
    await signOut();
    return;
  }

  if (!session.allowed) {
    auth.blocked = true;
    auth.blockedEmail = session.email || user.email || "";
    auth.sessionError = false;
    auth.user = null;
    auth.loading = false;
    await signOut();
    return;
  }

  auth.blocked = false;
  auth.blockedEmail = "";
  auth.sessionError = false;
  try {
    try {
      await refreshWithRetry(recipes);
    } catch (err) {
      console.error("recipe list failed", err);
      recipes.loadError = true;
    }
    await stepApp.library.refresh();
    await stepApp.refreshLibraryItems();
    recipes.view = "chooser";
  } finally {
    auth.user = user;
    auth.loading = false;
  }

  if (!legacyLibraryImported) {
    legacyLibraryImported = true;
    stepApp.library
      .importLegacy()
      .then(({ imported }) => {
        if (!imported) return;
        return stepApp.library.refresh().then(() => stepApp.refreshLibraryItems());
      })
      .catch((err) => console.error("legacy library import failed", err));
  }
}

// The backend binds its port a beat after Vite under `make local-dev`; retry the
// initial list fetch briefly so the chooser doesn't land empty on the race.
async function refreshWithRetry(recipes, attempts = 6) {
  for (let i = 0; i < attempts; i++) {
    try {
      await recipes.refresh();
      return;
    } catch (err) {
      if (i === attempts - 1) throw err;
      await new Promise((r) => setTimeout(r, 300 * (i + 1)));
    }
  }
}

getRedirectResult().catch((err) => console.error("redirect sign-in failed", err));

onAuthStateChanged((user) => {
  latestUser = user;
  applyAuth(user).catch((err) => console.error("auth handling failed", err));
});

Alpine.data("stepCalculator", () => {
  // Wrap in Alpine's reactive proxy so the adapter's methods (which mutate
  // `this`) trigger re-renders, and so persistence mutates the same proxy.
  // The product entry opts into HTTP explicitly (base = VITE_API_BASE ?? "",
  // same-origin via the Vite proxy in dev); tests keep the stub default.
  const app = Alpine.reactive(createStepApp({ useHttp: true, libraryClient }));
  app.bindReactive(app);
  persistence.bindApp(app);
  app.onChange = () => persistence.queueSave();
  stepApp = app;
  // Auth may have resolved before this factory ran — land on the chooser now.
  if (latestUser !== undefined) applyAuth(latestUser).catch((err) => console.error("auth handling failed", err));
  return app;
});

Alpine.start();
