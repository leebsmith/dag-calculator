// Master store: a reactive subscriber/mirror over the engine's root set. The
// engine is the single writer and source of truth; this store never owns a
// second root map and only forwards engine root events to UI listeners.

export function createMasterStore() {
  let engine = null;
  const listeners = new Set();

  function notify(nodeId, value) {
    for (const listener of listeners) listener(nodeId, value);
  }

  return {
    attach(nextEngine) {
      engine = nextEngine;
      notify("*", null);
    },
    publish(nodeId, value) {
      notify(nodeId, value);
    },
    getRoot(nodeId) {
      return engine?.getRoot(nodeId);
    },
    hasRoot(nodeId) {
      return engine?.hasRoot(nodeId) ?? false;
    },
    allRoots() {
      return engine?.allRoots() ?? {};
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
