// Master store: holds roots ONLY (user inputs, selection ids).
// Derived values are computed by the engine and never stored here.

export function createMasterStore(initialRoots = {}) {
  const roots = new Map(Object.entries(initialRoots));
  const listeners = new Set();

  return {
    setRoot(nodeId, value) {
      roots.set(nodeId, value);
      for (const listener of listeners) listener(nodeId, value);
    },
    unsetRoot(nodeId) {
      if (!roots.delete(nodeId)) return;
      for (const listener of listeners) listener(nodeId, undefined);
    },
    replaceRoots(rootsObj) {
      roots.clear();
      for (const [nodeId, value] of Object.entries(rootsObj ?? {})) roots.set(nodeId, value);
      for (const listener of listeners) listener("*", null);
    },
    getRoot(nodeId) {
      return roots.get(nodeId);
    },
    hasRoot(nodeId) {
      return roots.has(nodeId);
    },
    allRoots() {
      return Object.fromEntries(roots);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
