import Alpine from "alpinejs";

import { createStepApp } from "./adapters/stepAdapter.js";
import { setTokenProvider } from "./adapters/apiClient.js";
import { reportError } from "./observability.js";
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
import { createSetupStore } from "./store/setup.js";
import { createRecipesStore } from "./store/recipes.js";

setTokenProvider(getIdToken);

// Anchor a fixed-position popover under (or above) its trigger. Fixed
// positioning keeps menus out of the batches body's scroll clipping.
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

const setupStore = createSetupStore({
  onCreated: () => {
    const recipes = Alpine.store("recipes");
    recipes.scope = "all";
    recipes.view = "editor";
    recipes.syncActive();
    // A new batch starts at the style parameterisation screen.
    stepApp?.next();
  },
});

Alpine.store("setup", setupStore);

// The Batches controller is a factory so its state machine is testable without
// Alpine or a DOM; main.js supplies the persistence seam, the setup store, and
// the viewport-aware popover anchoring.
Alpine.store(
  "recipes",
  createRecipesStore({
    persistence,
    getSetup: () => Alpine.store("setup"),
    anchor: anchorStyle,
  })
);

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
// the Batches view; the editor is entered only via New/Open/Fork (each loads
// state). The user is published only AFTER the list is fetched, so the list
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
    recipes.view = "batches";
    recipes.scope = "all";
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
    reportError("main.session", err);
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
      reportError("main.recipeList", err);
      recipes.loadError = true;
    }
    await stepApp.library.refresh();
    await stepApp.refreshLibraryItems();
    await Alpine.store("setup").refreshAssets();
    recipes.view = "batches";
  } finally {
    auth.user = user;
    auth.loading = false;
  }

  if (!legacyLibraryImported) {
    legacyLibraryImported = true;
    stepApp.library
      .importLegacy()
      .then(({ imported }) => {
        if (!imported) return null;
        return stepApp.library.refresh().then(() => stepApp.refreshLibraryItems());
      })
      .catch((err) => reportError("main.legacyImport", err));
  }
}

// The backend binds its port a beat after Vite under `make local-dev`; retry the
// initial list fetch briefly so the view doesn't land empty on the race.
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

getRedirectResult().catch((err) => reportError("main.redirectSignIn", err));

onAuthStateChanged((user) => {
  latestUser = user;
  applyAuth(user).catch((err) => reportError("main.auth", err));
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
  app.onRecordsChanged = () => {
    Alpine.store("setup")
      .refreshAssets()
      .catch((err) => reportError("main.setupRefresh", err));
  };
  stepApp = app;
  // Auth may have resolved before this factory ran — land on Batches now.
  if (latestUser !== undefined) applyAuth(latestUser).catch((err) => reportError("main.auth", err));
  return app;
});

Alpine.start();
