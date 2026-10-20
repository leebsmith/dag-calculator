import Alpine from "alpinejs";

import { createCalculatorApp } from "./adapters/engineAdapter.js";
import { createStepApp } from "./adapters/stepAdapter.js";
import { setTokenProvider } from "./adapters/apiClient.js";
import { getIdToken, signInAnonymously, signOut, onAuthStateChanged } from "./firebase.js";
import * as persistence from "./store/persistence.js";

setTokenProvider(getIdToken);

Alpine.store("auth", {
  user: null,
  loading: true,
  signIn: () => signInAnonymously(),
  signOut: () => signOut(),
});

Alpine.store("recipes", {
  view: "chooser", // "chooser" | "editor"
  trashView: false,
  batches: [],
  activeId: null,
  activeName: "",
  loadError: false,

  get visible() {
    return this.batches.filter((b) => (b.trashed ?? false) === this.trashView);
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
    const drift = await persistence.driftFor(id);
    if (drift.length) {
      const proceed = window.confirm(
        `${drift.length} seed component(s) changed since this batch was frozen.\n\n` +
          "The copy will re-resolve against the current seeds."
      );
      if (!proceed) return;
    }
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

// --- Auth-owned boot ---------------------------------------------------------
// The authenticated shell (`.app-content`) is gated on `$store.auth.user` with
// `x-if`, so nothing compiles or solves before sign-in. On sign-in we land on
// the recipe chooser; the editor is entered only via New/Open/Fork (each loads
// state). The user is published only AFTER the list is fetched, so the chooser
// never paints with stale/empty state.
let stepApp = null;
let latestUser; // undefined until the first auth callback

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
    auth.user = null;
    auth.loading = false;
    return;
  }

  if (!stepApp) return;

  auth.loading = true;
  try {
    try {
      await refreshWithRetry(recipes);
    } catch (err) {
      console.error("recipe list failed", err);
      recipes.loadError = true;
    }
    recipes.view = "chooser";
  } finally {
    auth.user = user;
    auth.loading = false;
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

onAuthStateChanged((user) => {
  latestUser = user;
  applyAuth(user).catch((err) => console.error("auth handling failed", err));
});

Alpine.data("calculator", () => createCalculatorApp());
Alpine.data("stepCalculator", () => {
  // Wrap in Alpine's reactive proxy so the adapter's methods (which mutate
  // `this`) trigger re-renders, and so persistence mutates the same proxy.
  // The product entry opts into HTTP explicitly (base = VITE_API_BASE ?? "",
  // same-origin via the Vite proxy in dev); tests keep the stub default.
  const app = Alpine.reactive(createStepApp({ useHttp: true }));
  persistence.bindApp(app);
  app.onChange = () => persistence.queueSave();
  stepApp = app;
  // Auth may have resolved before this factory ran — land on the chooser now.
  if (latestUser !== undefined) applyAuth(latestUser).catch((err) => console.error("auth handling failed", err));
  return app;
});

Alpine.start();
