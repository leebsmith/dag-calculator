// Firebase Auth (compat/CDN build). The SDK is loaded via <script> in index.html
// and exposed as `globalThis.firebase`. Browser-only — never imported by node tests.

const firebase = globalThis.firebase;

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? "demo-api-key",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? "dag-calculator.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? "dag-calculator",
};

const app = firebase.initializeApp(config);
export const auth = firebase.auth(app);

if (import.meta.env.DEV || import.meta.env.VITE_FIREBASE_EMULATOR) {
  auth.useEmulator("http://127.0.0.1:9099");
}

export function signInAnonymously() {
  return auth.signInAnonymously();
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
