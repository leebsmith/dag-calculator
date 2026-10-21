// Firebase client configuration resolution (pure, browser-agnostic).
//
// Kept separate from firebase.js so it can be unit-tested in node without
// touching `globalThis.firebase`. The demo/emulator fallback values are NOT
// defined here: they live in firebase.js behind an `import.meta.env.DEV` guard
// so a production build never bundles them.

const REQUIRED_KEYS = ["apiKey", "authDomain", "projectId"];

const ENV_NAMES = {
  apiKey: "VITE_FIREBASE_API_KEY",
  authDomain: "VITE_FIREBASE_AUTH_DOMAIN",
  projectId: "VITE_FIREBASE_PROJECT_ID",
};

/**
 * Resolve the Firebase client config from build-time environment values.
 *
 * Throws when any required key is missing and no `fallback` is supplied
 * (production fails fast). With a `fallback`, missing keys are filled from it
 * (development/emulator mode).
 *
 * @param {{ apiKey?: string, authDomain?: string, projectId?: string,
 *           fallback?: { apiKey?: string, authDomain?: string, projectId?: string } }} env
 * @returns {{ apiKey: string, authDomain: string, projectId: string }}
 */
export function resolveFirebaseConfig({ apiKey, authDomain, projectId, fallback }) {
  const provided = { apiKey, authDomain, projectId };
  const missing = REQUIRED_KEYS.filter((key) => !provided[key]);

  if (missing.length === 0) {
    return { apiKey, authDomain, projectId };
  }
  if (!fallback || typeof fallback !== "object") {
    throw new Error(
      `Missing Firebase configuration: ${missing.map((key) => ENV_NAMES[key]).join(", ")}`
    );
  }
  return {
    apiKey: apiKey || fallback.apiKey,
    authDomain: authDomain || fallback.authDomain,
    projectId: projectId || fallback.projectId,
  };
}
