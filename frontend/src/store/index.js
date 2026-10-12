// Composition root for state: one master store (roots only, slice-composed) plus
// the ephemeral UI store. No derived values live here.
import { createMasterStore } from "./masterStore.js";
import { createUiStore } from "../ui/uiStore.js";
import { mashSlice } from "./slices/mash.js";

const SLICES = [mashSlice];

export function createAppStore() {
  const initialRoots = Object.assign({}, ...SLICES.map((s) => s.roots));
  return {
    master: createMasterStore(initialRoots),
    ui: createUiStore(),
  };
}

export { SLICES };
