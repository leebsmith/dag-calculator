import Alpine from "alpinejs";

import "./tokens.css";
import "./style.css";

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
  open: false,
  batches: [],
  activeId: null,

  toggle() {
    this.open = !this.open;
    if (this.open) this.refresh();
  },

  syncActive() {
    this.activeId = persistence.getActive()?.id ?? null;
  },

  async refresh() {
    this.batches = await persistence.list();
    this.syncActive();
  },

  async newRecipe() {
    const name = (window.prompt("Recipe name") ?? "").trim() || "Untitled";
    await persistence.createDraft(name);
    await this.refresh();
    this.open = false;
  },

  async openDraft(id) {
    await persistence.open(id);
    this.syncActive();
    this.open = false;
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
    await this.refresh();
    this.open = false;
  },

  async rename() {
    const active = persistence.getActive();
    if (!active || active.status !== "draft") return;
    const name = (window.prompt("Rename recipe", active.name) ?? "").trim();
    if (name) {
      await persistence.renameActive(name);
      await this.refresh();
    }
  },

  async freeze() {
    await persistence.freezeActive();
    await this.refresh();
  },
});

// --- Auth-owned boot ---------------------------------------------------------
// The authenticated shell (`.app-content`) is gated on `$store.auth.user` with
// `x-if`, so nothing compiles or solves before sign-in. main.js owns boot so
// there is exactly ONE solve path: on sign-in, refresh the recipe list and
// either open the most recent draft (which loads + solves) or bootstrap the
// empty app. The user is published only AFTER boot, so the shell never paints
// with stale/empty state.
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
    auth.user = null;
    auth.loading = false;
    return;
  }

  // The component factory may not have run yet; it re-invokes this once it has.
  if (!stepApp) return;

  auth.loading = true;
  try {
    await recipes.refresh();
    const draft = recipes.batches.find((b) => b.status === "draft");
    if (draft) await persistence.open(draft.id);
    else await stepApp.init();
  } finally {
    auth.user = user;
    auth.loading = false;
  }
}

onAuthStateChanged((user) => {
  latestUser = user;
  applyAuth(user);
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
  // Auth may have resolved before this factory ran — boot now.
  if (latestUser !== undefined) applyAuth(latestUser);
  return app;
});

Alpine.start();
