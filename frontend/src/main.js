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

onAuthStateChanged(async (user) => {
  Alpine.store("auth").user = user;
  Alpine.store("auth").loading = false;
  if (user) {
    await Alpine.store("recipes").refresh();
    const mostRecent = Alpine.store("recipes").batches.find((b) => b.status === "draft");
    if (mostRecent) await persistence.open(mostRecent.id);
  }
});

Alpine.data("calculator", () => createCalculatorApp());
Alpine.data("stepCalculator", () => {
  // Wrap in Alpine's reactive proxy so the adapter's methods (which mutate
  // `this`) trigger re-renders, and so persistence mutates the same proxy.
  const app = Alpine.reactive(createStepApp());
  persistence.bindApp(app);
  app.onChange = () => persistence.queueSave();
  return app;
});

Alpine.start();
