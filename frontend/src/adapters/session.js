// Engine session: owns construction/rebuilding of the live calculator, the
// topological order, the boundary node list, and the live engine accessor.
// Everything that needs current engine state resolves it through this module.

import { createCalculator } from "../engine/index.js";
import { BOUNDARY_BUILDERS } from "./boundaryRequest.js";

// AI AGENT HOOKS: Use this session factory for constructing, rebuilding, and
// resetting the live engine. Do not duplicated this logic elsewhere — callers
// must resolve the engine through the session instead of capturing one.
export function createSession({
  artifact,
  cache,
  master,
  initialRoots = null,
  boundaries = {},
  selections = {},
  identity = {},
}) {
  let collections = { ...cache.collections };
  let selectionSnapshots = { ...selections };
  const identitySnapshot = identity;
  const startingRoots = initialRoots ?? master?.allRoots?.() ?? {};
  let engine = build(startingRoots);
  attachMaster();

  function build(rootState = {}) {
    return createCalculator(artifact, {
      identity: identitySnapshot,
      references: cache.references,
      collections,
      selections: selectionSnapshots,
      boundaries,
      boundaryRequests: BOUNDARY_BUILDERS,
      roots: rootState,
      onRootChange: (nodeId, value) => master?.publish?.(nodeId, value),
    });
  }

  function attachMaster() {
    if (typeof master?.attach === "function") master.attach(engine);
  }

  const boundaryNodes = engine.topoOrder.filter((id) => artifact.nodes[id].kind === "boundary");

  // AI AGENT HOOKS: Use this facade for resolving the live engine at call time.
  // Do not duplicated this logic elsewhere — never capture the raw engine.
  const engineRef = {
    identity: identitySnapshot,
    get: (id) => engine.get(id),
    getAuthored: (id) => engine.getAuthored(id),
    resolve: (path) => engine.resolve(path),
    call: (fnId, args) => engine.call(fnId, args),
    setRoot: (id, value) => engine.setRoot(id, value),
    unsetRoot: (id) => engine.unsetRoot(id),
    getRoot: (id) => engine.getRoot(id),
    hasRoot: (id) => engine.hasRoot(id),
    setCollection: (id, rows) => engine.setCollection(id, rows),
    setReferences: (references) => engine.setReferences(references),
    invalidate: (id) => engine.invalidate(id),
    boundaryRequest: (id) => engine.boundaryRequest(id),
    hasBoundaryResult: (fingerprint) => engine.hasBoundaryResult(fingerprint),
    applyBoundaryResult: (fingerprint, outputs) => engine.applyBoundaryResult(fingerprint, outputs),
    markBoundaryUnavailable: (id) => engine.markBoundaryUnavailable(id),
    clearBoundaryUnavailable: () => engine.clearBoundaryUnavailable(),
    relationStates: () => engine.relationStates(),
    domainStates: () => engine.domainStates(),
    fieldDomainStates: () => engine.fieldDomainStates(),
    collectionDomainStates: () => engine.collectionDomainStates(),
    get topoOrder() {
      return engine.topoOrder;
    },
  };

  function sanitizeRoots(roots) {
    const out = {};
    for (const [id, value] of Object.entries(roots ?? {})) {
      const kind = artifact.nodes[id]?.kind;
      if (kind === "root" || kind === "choice") out[id] = value;
    }
    return out;
  }

  return {
    getEngine() {
      return engine;
    },
    engine: engineRef,
    boundaryNodes,
    collections() {
      return collections;
    },
    selections() {
      return selectionSnapshots;
    },
    identity() {
      return identitySnapshot;
    },
    setIdentity(namespace, component) {
      const currentRoots = engine.allRoots();
      identitySnapshot[namespace] = component ? { ...component } : {};
      engine = build(currentRoots);
      attachMaster();
      return engine;
    },
    setSelection(nodeId, component) {
      if (component === null || component === undefined) {
        delete selectionSnapshots[nodeId];
      } else {
        selectionSnapshots[nodeId] = { ...component };
      }
      engine.invalidate(nodeId);
    },
    rebuild(state = {}) {
      if (state.identity) {
        for (const key of Object.keys(identitySnapshot)) delete identitySnapshot[key];
        Object.assign(identitySnapshot, state.identity);
      }
      collections = { ...cache.collections, ...(state.collections ?? {}) };
      selectionSnapshots = { ...(state.selections ?? {}) };
      engine = build(sanitizeRoots(state.roots));
      attachMaster();
      return engine;
    },
    reset(roots = {}) {
      collections = { ...cache.collections };
      selectionSnapshots = {};
      engine = build(sanitizeRoots(roots));
      attachMaster();
      return engine;
    },
  };
}
