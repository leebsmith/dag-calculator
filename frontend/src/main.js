import Alpine from "alpinejs";

import "./tokens.css";
import "./style.css";

import { createCalculatorApp } from "./adapters/engineAdapter.js";
import { createStepApp } from "./adapters/stepAdapter.js";
import { setTokenProvider } from "./adapters/apiClient.js";
import { getIdToken, signInAnonymously, signOut, onAuthStateChanged } from "./firebase.js";
import { freezeActiveDraft, queueSave } from "./store/persistence.js";

setTokenProvider(getIdToken);

Alpine.store("auth", {
  user: null,
  loading: true,
  signIn: () => signInAnonymously(),
  signOut: () => signOut(),
});

onAuthStateChanged((user) => {
  Alpine.store("auth").user = user;
  Alpine.store("auth").loading = false;
});

Alpine.data("calculator", () => createCalculatorApp());
Alpine.data("stepCalculator", () => {
  const app = createStepApp();
  app.onChange = () => queueSave(() => app.draftState());
  app.freeze = () => freezeActiveDraft(() => app.freezePayload());
  return app;
});

Alpine.start();
