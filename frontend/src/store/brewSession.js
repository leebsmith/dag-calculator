// Brew-session controller: state, getters and actions composed into the Alpine
// store. DOM-free; main.js injects the clients.

import { createBrewSessionState } from "./brewSessionModel.js";
import { brewSessionGetters } from "./brewSessionGetters.js";
import {
  createObservationActions,
  createSessionLifecycleActions,
  createStepActions,
} from "./brewSessionActions.js";

export function createBrewSessionStore({ client, loadBundle }) {
  const store = {
    ...createBrewSessionState(),
    ...createSessionLifecycleActions({ client, loadBundle }),
    ...createStepActions({ client }),
    ...createObservationActions({ client }),
  };
  Object.defineProperties(store, Object.getOwnPropertyDescriptors(brewSessionGetters));
  return store;
}
