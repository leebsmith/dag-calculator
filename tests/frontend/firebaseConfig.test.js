import test from "node:test";
import assert from "node:assert/strict";

import { resolveFirebaseConfig } from "../../frontend/src/firebaseConfig.js";

test("returns all three keys verbatim when fully configured", () => {
  assert.deepEqual(
    resolveFirebaseConfig({
      apiKey: "real-key",
      authDomain: "app.example.com",
      projectId: "real-project",
      fallback: undefined,
    }),
    { apiKey: "real-key", authDomain: "app.example.com", projectId: "real-project" }
  );
});

test("production with a missing key throws a readable error naming the variable", () => {
  assert.throws(
    () =>
      resolveFirebaseConfig({
        apiKey: "real-key",
        authDomain: undefined,
        projectId: "real-project",
        fallback: undefined,
      }),
    /Missing Firebase configuration: VITE_FIREBASE_AUTH_DOMAIN/
  );
});

test("production missing every key lists all of them", () => {
  assert.throws(
    () => resolveFirebaseConfig({ fallback: undefined }),
    /VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID/
  );
});

test("development falls back to the supplied demo config for missing keys", () => {
  const demo = {
    apiKey: "demo-api-key",
    authDomain: "dag-calculator.firebaseapp.com",
    projectId: "dag-calculator",
  };
  assert.deepEqual(
    resolveFirebaseConfig({ apiKey: undefined, authDomain: undefined, projectId: undefined, fallback: demo }),
    demo
  );
});

test("development prefers a real value over the fallback per key", () => {
  const demo = { apiKey: "demo-api-key", authDomain: "demo.example.com", projectId: "demo" };
  assert.deepEqual(
    resolveFirebaseConfig({ apiKey: "real-key", authDomain: undefined, projectId: undefined, fallback: demo }),
    { apiKey: "real-key", authDomain: "demo.example.com", projectId: "demo" }
  );
});

test("empty strings count as missing", () => {
  assert.throws(
    () =>
      resolveFirebaseConfig({
        apiKey: "",
        authDomain: "app.example.com",
        projectId: "real-project",
        fallback: undefined,
      }),
    /VITE_FIREBASE_API_KEY/
  );
});
