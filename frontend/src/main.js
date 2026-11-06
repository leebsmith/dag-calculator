import Alpine from "alpinejs";

import { createStepApp } from "./adapters/stepAdapter.js";
import { createApiClient } from "./adapters/apiClient.js";
import { createModalFocusManager } from "./adapters/modalFocus.js";
import { createObservabilityManager } from "./observability.js";
import { createAuthClient } from "./adapters/authClient.js";
import { createBatchClient } from "./adapters/batchClient.js";
import { createLibraryClient } from "./adapters/libraryClient.js";
import { createSessionClient } from "./adapters/sessionClient.js";
import {
  closeReportTab,
  downloadBlob,
  downloadJSON,
  openReportTab,
  showReport,
} from "./adapters/download.js";
import {
  getIdToken,
  getRedirectResult,
  onAuthStateChanged,
  signInWithGoogle,
  signOut,
} from "./firebase.js";
import { createPersistenceManager } from "./store/persistence.js";
import { createImportClient, readFileAsBase64 } from "./adapters/importClient.js";
import { createLibrary } from "./store/library.js";
import { createReferenceCache } from "./store/referenceCache.js";
import { runGate } from "./adapters/importGate.js";
import { projectImport } from "./adapters/importProjection.js";
import { buildDelta } from "./adapters/importDelta.js";
import { createImportsStore } from "./store/imports.js";
import { createImportReviewStore } from "./store/importReview.js";
import { createSetupStore } from "./store/setup.js";
import { createRecipesStore } from "./store/recipes.js";
import { createBrewSessionStore } from "./store/brewSession.js";

// The JSON seam and its clients are instantiated at boot and injected down; no
// module owns a shared token provider. Firebase's `getIdToken` is the one
// provider this app hands to the seam.
const observability = createObservabilityManager();
const { reportError } = observability;
const api = createApiClient({ tokenProvider: getIdToken });
const authClient = createAuthClient({ api });
const batchClient = createBatchClient({ api });
const libraryClient = createLibraryClient({ api });
const sessionClient = createSessionClient({ api });
const modalFocus = createModalFocusManager();

// One reference cache for the whole app: the setup store, the step app's engine
// and the import ledger all read this instance and the library that fills it.
const referenceCache = createReferenceCache();
const library = createLibrary({
  client: libraryClient,
  observability,
  onChange: () => syncReferenceCache(),
});

let stepApp = null;

function syncReferenceCache() {
  referenceCache.syncLibraryItems(library.items());
  stepApp?.refreshReferences();
}

const persistence = createPersistenceManager({
  client: batchClient,
  app: () => stepApp,
  setTimeout,
  clearTimeout,
});

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

const importClient = createImportClient({ api });

// Opening a record means showing it: the import view reads one record at a time.
const reviewStore = createImportReviewStore({
  client: importClient,
  observability,
  // The one unified reference cache: the import's chips, its projection and the
  // gate read exactly the maps the pickers and engine read.
  referenceCache,
  profiles: () => Alpine.store("setup").waterTargetOptions(),
  project: projectImport,
  gate: (state) =>
    runGate({
      state,
      api,
      references: referenceCache.references,
      reportError: observability.reportError,
    }),
  delta: (args) => buildDelta({ ...args, reportError: observability.reportError }),
  sourceFile: () => Alpine.store("imports").lastFile,
  readFile: readFileAsBase64,
  commit: async ({ record, state, name }) => {
    const active = await persistence.createWithIdentity({
      name,
      identity: record.identity,
      state,
    });
    await importClient.patch(record.id, {
      status: "committed",
      batch_id: active.id,
      yeast_outcome: record.yeast_outcome ?? undefined,
      delta: record.delta ?? undefined,
    });
    const recipes = Alpine.store("recipes");
    recipes.view = "editor";
    recipes.syncActive();
    Alpine.store("imports").refresh();
    return active;
  },
  onClose: () => {
    // backToBatches flushes and refreshes the list; assigning the view directly left
    // a batch created by the import invisible until a hard reload.
    Alpine.store("recipes")
      .backToBatches()
      .catch((err) => reportError("main.importClose", err));
    Alpine.store("imports").refresh();
  },
});

Alpine.store("importReview", reviewStore);

Alpine.store(
  "imports",
  createImportsStore({
    client: importClient,
    observability,
    readFile: readFileAsBase64,
    onOpen: (record) => {
      reviewStore.open(record);
      Alpine.store("recipes").view = "import";
    },
    onError: (err) => {
      const recipes = Alpine.store("recipes");
      recipes.actionError = {
        title: "Import failed",
        message: err?.message ?? "Could not read the document.",
      };
    },
  })
);

const setupStore = createSetupStore({
  client: libraryClient,
  persistence,
  observability,
  cache: referenceCache,
  library,
  onImportRecipe: async ({ filename, file, identity, force }) => {
    const imports = Alpine.store("imports");
    const record = await imports.start({ filename, file, identity, force });
    if (record) return record;
    // A duplicate has its own panel (resume or pick another file); everything
    // else is a refusal the dialog must state where the user is looking.
    if (imports.duplicateOf) return null;
    throw new Error(imports.error ?? "Could not read the document.");
  },
  onCreated: () => {
    const recipes = Alpine.store("recipes");
    recipes.scope = "all";
    recipes.view = "editor";
    recipes.syncActive();
    // A new batch starts at the style parameterisation screen.
    stepApp?.resetToStyle();
  },
});

Alpine.store("setup", setupStore);

// The Batches controller is a factory so its state machine is testable without
// Alpine or a DOM; main.js supplies the persistence seam, the setup store, the
// viewport-aware popover anchoring, and the download/report-tab clients.
Alpine.store("brewSession", createBrewSessionStore({
  client: sessionClient,
  observability,
  loadBundle: (id, name) => persistence.reportBundleFor(id, name),
  openReport: async (id) => {
    const tab = openReportTab();
    try {
      const blob = await sessionClient.getSessionReport(id);
      showReport(tab, blob, `brew-session-${id}.pdf`);
    } catch (err) {
      closeReportTab(tab);
      throw err;
    }
  },
}));

Alpine.store(
  "recipes",
  createRecipesStore({
    persistence,
    observability,
    getSetup: () => Alpine.store("setup"),
    anchor: anchorStyle,
    download: downloadJSON,
    downloadFile: downloadBlob,
    openTab: openReportTab,
    showTab: showReport,
    closeTab: closeReportTab,
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
let latestUser; // undefined until the first auth callback
let legacyLibraryImported = false;

// The library and the import queue are independent reads; fetch them together so
// the landing page paints once, with both strips populated.
async function refreshSurfaces() {
  await Alpine.store("setup").refreshAssets();
  await Alpine.store("imports").refresh();
}

async function applyAuth(user) {
  const auth = Alpine.store("auth");
  const recipes = Alpine.store("recipes");

  if (!user) {
    stepApp?.teardown();
    persistence.clearActive();
    Object.assign(recipes, {
      batches: [],
      activeId: null,
      activeName: "",
      view: "batches",
      scope: "all",
      sortOpen: false,
      rowMenu: null,
      renamingId: null,
    });
    Alpine.store("brewSession").close();
    auth.user = null;
    auth.loading = false;
    return;
  }

  if (!stepApp) return;

  auth.loading = true;
  let session;
  try {
    session = await authClient.getSession();
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
    await refreshSurfaces();
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
  // The product entry solves over HTTP (base = VITE_API_BASE ?? "", same-origin
  // via the Vite proxy in dev); tests inject a boundary double instead.
  const app = Alpine.reactive(
    createStepApp({
      api,
      libraryClient,
      cache: referenceCache,
      library,
      modalFocus,
      observability,
      isEditorActive: () => {
        if (app.libraryOpen) return false;
        const recipes = Alpine.store("recipes");
        if (recipes?.view !== "editor") return false;
        if (recipes?.reportPickerOpen) return false;
        const setup = Alpine.store("setup");
        if (setup?.state?.modalOpen) return false;
        if (Alpine.store("brewSession")?.open) return false;
        return true;
      },
    })
  );
  app.bindReactive(app);
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
