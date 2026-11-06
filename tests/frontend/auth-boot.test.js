import test from "node:test";
import assert from "node:assert/strict";

import { createAuthBoot } from "../../frontend/src/adapters/authBoot.js";

function harness({
  session = { allowed: true },
  refreshFailures = 0,
  legacy = { imported: false },
} = {}) {
  const calls = [];
  const auth = {
    _user: undefined,
    get user() {
      return this._user;
    },
    set user(value) {
      calls.push("publish");
      this._user = value;
    },
    loading: true,
    blocked: false,
    blockedEmail: "",
    sessionError: false,
  };
  let refreshes = 0;
  const recipes = {
    view: "batches",
    loadError: false,
    async refresh() {
      refreshes += 1;
      calls.push("recipes.refresh");
      if (refreshes <= refreshFailures) throw new Error("list down");
    },
  };
  const stores = {
    auth,
    recipes,
    setup: { refreshAssets: async () => calls.push("setup.refreshAssets") },
    imports: { refresh: async () => calls.push("imports.refresh") },
    brewSession: { close: () => calls.push("brewSession.close") },
  };
  const app = {
    teardown: () => calls.push("teardown"),
    refreshLibraryItems: async () => calls.push("refreshLibraryItems"),
    library: {
      importLegacy: async () => {
        calls.push("importLegacy");
        if (legacy instanceof Error) throw legacy;
        return legacy;
      },
      refresh: async () => calls.push("library.refresh"),
    },
  };
  const appHandle = { current: app };
  const persistence = { clearActive: () => calls.push("clearActive") };
  const authClient = {
    async getSession() {
      if (session instanceof Error) throw session;
      return session;
    },
  };
  const reportError = (scope, err) => calls.push({ scope, message: err.message });
  const signOut = async () => calls.push("signOut");

  const boot = createAuthBoot({
    authClient,
    appHandle,
    persistence,
    store: (name) => stores[name],
    reportError,
    signOut,
    sleep: async () => {},
  });

  return { boot, auth, recipes, app, appHandle, stores, calls };
}

test("signing out tears the editor down and resets the batch surface", async () => {
  const { boot, auth, recipes, calls } = harness();

  await boot.applyAuth(null);

  assert.deepEqual(calls, ["teardown", "clearActive", "brewSession.close", "publish"]);
  assert.equal(auth.user, null);
  assert.equal(auth.loading, false);
  assert.deepEqual(recipes.batches, []);
  assert.equal(recipes.activeId, null);
  assert.equal(recipes.view, "batches");
  assert.equal(recipes.scope, "all");
  assert.equal(recipes.rowMenu, null);
});

test("no step app means no auth work at all", async () => {
  const { boot, auth, appHandle, calls } = harness();
  appHandle.current = null;

  await boot.applyAuth({ email: "a@b.c" });

  assert.deepEqual(calls, []);
  assert.equal(auth.loading, true);
  assert.equal(auth.user, undefined);
});

test("a failed session probe reports and signs out", async () => {
  const { boot, auth, calls } = harness({ session: new Error("session down") });

  await boot.applyAuth({ email: "a@b.c" });

  assert.equal(auth.sessionError, true);
  assert.equal(auth.user, null);
  assert.equal(auth.loading, false);
  assert.equal(calls.at(-1), "signOut");
  assert.deepEqual(calls.find((call) => call.scope), {
    scope: "main.session",
    message: "session down",
  });
});

test("a refused allowlist blocks the account before touching the stores", async () => {
  const { boot, auth, calls } = harness({
    session: { allowed: false, email: "blocked@example.com" },
  });

  await boot.applyAuth({ email: "user@example.com" });

  assert.equal(auth.blocked, true);
  assert.equal(auth.blockedEmail, "blocked@example.com");
  assert.equal(auth.user, null);
  assert.equal(auth.loading, false);
  assert.equal(calls.includes("setup.refreshAssets"), false);
  assert.equal(calls.at(-1), "signOut");
});

test("sign-in loads the list and the surfaces before publishing the user", async () => {
  const { boot, auth, recipes, calls } = harness();

  await boot.applyAuth({ email: "a@b.c" });

  const published = calls.indexOf("publish");
  assert.ok(published > calls.indexOf("recipes.refresh"));
  assert.ok(published > calls.indexOf("setup.refreshAssets"));
  assert.ok(published > calls.indexOf("refreshLibraryItems"));
  assert.ok(published > calls.indexOf("imports.refresh"));
  assert.equal(recipes.view, "batches");
  assert.equal(auth.user.email, "a@b.c");
  assert.equal(auth.loading, false);
});

test("the list fetch retries before giving up, then still publishes", async () => {
  const { boot, auth, recipes, calls } = harness({ refreshFailures: 2 });

  await boot.applyAuth({ email: "a@b.c" });

  assert.equal(calls.filter((call) => call === "recipes.refresh").length, 3);
  assert.equal(recipes.loadError, false);
  assert.equal(auth.user.email, "a@b.c");
});

test("a list that never loads is reported and published anyway", async () => {
  const { boot, auth, recipes, calls } = harness({ refreshFailures: 6 });

  await boot.applyAuth({ email: "a@b.c" });

  assert.equal(calls.filter((call) => call === "recipes.refresh").length, 6);
  assert.equal(recipes.loadError, true);
  assert.deepEqual(calls.find((call) => call.scope), {
    scope: "main.recipeList",
    message: "list down",
  });
  assert.equal(auth.user.email, "a@b.c");
});

test("the legacy library import runs once per session", async () => {
  const { boot, calls } = harness({ legacy: { imported: true } });

  await boot.applyAuth({ email: "a@b.c" });
  await new Promise((resolve) => setTimeout(resolve, 0));
  await boot.applyAuth({ email: "a@b.c" });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(calls.filter((call) => call === "importLegacy").length, 1);
  assert.equal(calls.filter((call) => call === "library.refresh").length, 1);
  assert.equal(calls.filter((call) => call === "refreshLibraryItems").length, 3);
});

test("a failed legacy import is reported, not thrown", async () => {
  const { boot, calls } = harness({ legacy: new Error("legacy down") });

  await boot.applyAuth({ email: "a@b.c" });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(
    calls.find((call) => call.scope),
    { scope: "main.legacyImport", message: "legacy down" }
  );
});

test("refreshWithRetry stops at the first success", async () => {
  const { boot, calls } = harness();

  await boot.refreshWithRetry({ refresh: async () => calls.push("ok") });

  assert.equal(calls.filter((call) => call === "ok").length, 1);
});
