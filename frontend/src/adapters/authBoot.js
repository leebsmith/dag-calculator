// The authenticated shell's boot workflow: allowlist probe, recipe-list retry,
// surface refresh, publish-last, and the one-time legacy library import.
//
// Stores, the late-bound app handle and the session client are injected, so the
// workflow is node-testable; `main.js` supplies the Alpine store lookup and the
// side-effecting sign-out.

const RESET_RECIPES = {
  batches: [],
  activeId: null,
  activeName: "",
  view: "batches",
  scope: "all",
  sortOpen: false,
  rowMenu: null,
  renamingId: null,
};

function resetSignedOutState(auth, recipes, ctx) {
  ctx.appHandle.current?.teardown();
  ctx.persistence.clearActive();
  Object.assign(recipes, RESET_RECIPES);
  ctx.store("brewSession").close();
  auth.user = null;
  auth.loading = false;
}

function refuseAuth(auth, { blocked, email, sessionError }) {
  auth.blocked = blocked;
  auth.blockedEmail = email;
  auth.sessionError = sessionError;
  auth.user = null;
  auth.loading = false;
}

// The library and the import queue are independent reads; fetch them together
// so the landing page paints once, with both strips populated. The shared
// library refresh happens exactly once here; `refreshLibraryItems` then points
// the engine at the fresh catalogue instead of forcing a second fetch.
async function refreshSurfaces(ctx) {
  await ctx.store("setup").refreshAssets();
  await ctx.appHandle.current.refreshLibraryItems();
  await ctx.store("imports").refresh();
}

// The backend binds its port a beat after Vite under `make local-dev`; retry
// the initial list fetch briefly so the view doesn't land empty on the race.
async function refreshWithRetry(recipes, attempts, sleep) {
  for (let i = 0; i < attempts; i++) {
    try {
      await recipes.refresh();
      return;
    } catch (err) {
      if (i === attempts - 1) throw err;
      await sleep(300 * (i + 1));
    }
  }
}

function importLegacyOnce(state, ctx) {
  if (state.legacyLibraryImported) return;
  state.legacyLibraryImported = true;
  ctx.appHandle.current.library
    .importLegacy()
    .then(({ imported }) => {
      if (!imported) return null;
      return ctx.appHandle.current.library
        .refresh()
        .then(() => ctx.appHandle.current.refreshLibraryItems());
    })
    .catch((err) => ctx.reportError("main.legacyImport", err));
}

async function applyAuth(user, ctx, state) {
  const auth = ctx.store("auth");
  const recipes = ctx.store("recipes");

  if (!user) {
    resetSignedOutState(auth, recipes, ctx);
    return;
  }
  if (!ctx.appHandle.current) return;

  auth.loading = true;
  let session;
  try {
    session = await ctx.authClient.getSession();
  } catch (err) {
    ctx.reportError("main.session", err);
    refuseAuth(auth, { blocked: false, email: "", sessionError: true });
    await ctx.signOut();
    return;
  }

  if (!session.allowed) {
    refuseAuth(auth, {
      blocked: true,
      email: session.email || user.email || "",
      sessionError: false,
    });
    await ctx.signOut();
    return;
  }

  auth.blocked = false;
  auth.blockedEmail = "";
  auth.sessionError = false;
  try {
    try {
      await refreshWithRetry(recipes, 6, ctx.sleep);
    } catch (err) {
      ctx.reportError("main.recipeList", err);
      recipes.loadError = true;
    }
    await refreshSurfaces(ctx);
    recipes.view = "batches";
  } finally {
    auth.user = user;
    auth.loading = false;
  }

  importLegacyOnce(state, ctx);
}

export function createAuthBoot(options) {
  const ctx = {
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    ...options,
  };
  const state = { legacyLibraryImported: false };
  return {
    applyAuth: (user) => applyAuth(user, ctx, state),
    refreshSurfaces: () => refreshSurfaces(ctx),
    refreshWithRetry: (recipes) => refreshWithRetry(recipes, 6, ctx.sleep),
  };
}
