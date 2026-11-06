// Brew-session controller: state, getters and actions composed into the Alpine
// store. DOM-free; main.js injects the clients.

import { requireObservability } from "../observability.js";
import { createBrewSessionState } from "./brewSessionModel.js";
import { brewSessionGetters } from "./brewSessionGetters.js";
import {
  createObservationActions,
  createReportActions,
  createSessionLifecycleActions,
  createStepActions,
} from "./brewSessionActions.js";

export function createBrewSessionStore({
  client,
  loadBundle,
  openReport = async () => {},
  observability = requireObservability(null, "createBrewSessionStore"),
}) {
  const store = {
    ...createBrewSessionState({ reportError: observability.reportError }),
    ...createSessionLifecycleActions({ client, loadBundle }),
    ...createReportActions({ client, openReport }),
    ...createStepActions({ client }),
    ...createObservationActions({ client }),
  };
  Object.defineProperties(store, Object.getOwnPropertyDescriptors(brewSessionGetters));
  return store;
}
