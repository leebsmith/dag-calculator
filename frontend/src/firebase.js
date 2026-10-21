// Firebase Auth (compat/CDN build). The SDK is loaded via <script> in index.html
// and exposed as `globalThis.firebase`. Browser-only — never imported by node tests.

import { resolveFirebaseConfig } from "./firebaseConfig.js";

const firebase = globalThis.firebase;

const config = resolveFirebaseConfig({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  // Emulator/demo fallback, stripped from production builds by `import.meta.env.DEV`.
  fallback: import.meta.env.DEV
    ? {
        apiKey: "demo-api-key",
        authDomain: "dag-calculator.firebaseapp.com",
        projectId: "dag-calculator",
      }
    : undefined,
});

const app = firebase.initializeApp(config);
export const auth = firebase.auth(app);

if (import.meta.env.DEV || import.meta.env.VITE_FIREBASE_EMULATOR) {
  auth.useEmulator("http://127.0.0.1:9099");
}

const POPUP_FALLBACK_CODES = new Set([
  "auth/popup-blocked",
  "auth/popup-closed-by-user",
  "auth/cancelled-popup-request",
  "auth/operation-not-supported-in-this-environment",
]);

function googleProvider() {
  const provider = new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return provider;
}

export async function signInWithGoogle() {
  const provider = googleProvider();
  try {
    return await auth.signInWithPopup(provider);
  } catch (err) {
    if (POPUP_FALLBACK_CODES.has(err?.code)) {
      return auth.signInWithRedirect(provider);
    }
    throw err;
  }
}

export function getRedirectResult() {
  return auth.getRedirectResult();
}

export function signOut() {
  return auth.signOut();
}

export function onAuthStateChanged(callback) {
  return auth.onAuthStateChanged(callback);
}

export async function getIdToken() {
  const user = auth.currentUser;
  if (!user) return null;
  return user.getIdToken();
}
