// Engine session: owns construction/rebuilding of the live calculator, the
// topological order, the boundary node list, and the live engine accessor.
// Everything that needs current engine state resolves it through this module.

import { createCalculator } from "../engine/index.js";
import { BOUNDARY_BUILDERS } from "./boundaryRequest.js";
import { STUB_BOUNDARIES } from "./stubBoundaries.js";

// AI AGENT HOOKS: Use this session factory for constructing, rebuilding, and
// resetting the live engine. Do not duplicated this logic elsewhere — callers
// must resolve the engine through the session instead of capturing one.
export function createSession({ artifact, cache, master, useHttp = false, selections = {} }) {
  let collections = { ...cache.collections };
  let selectionSnapshots = { ...selections };
  let engine = build();

  function build() {
    return createCalculator(artifact, {
      references: cache.references,
      collections,
      selections: selectionSnapshots,
      boundaries: useHttp ? {} : STUB_BOUNDARIES,
      boundaryRequests: BOUNDARY_BUILDERS,
      roots: master.allRoots(),
    });
  }

  const boundaryNodes = engine.topoOrder.filter((id) => artifact.nodes[id].kind === "boundary");

  // AI AGENT HOOKS: Use this facade for resolving the live engine at call time.
  // Do not duplicated this logic elsewhere — never capture the raw engine.
  const engineRef = {
    get: (id) => engine.get(id),
    resolve: (path) => engine.resolve(path),
    call: (fnId, args) => engine.call(fnId, args),
    setRoot: (id, value) => engine.setRoot(id, value),
    setCollection: (id, rows) => engine.setCollection(id, rows),
    invalidate: (id) => engine.invalidate(id),
    boundaryRequest: (id) => engine.boundaryRequest(id),
    hasBoundaryResult: (fingerprint) => engine.hasBoundaryResult(fingerprint),
    applyBoundaryResult: (fingerprint, outputs) => engine.applyBoundaryResult(fingerprint, outputs),
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
    setSelection(nodeId, component) {
      if (component === null || component === undefined) {
        delete selectionSnapshots[nodeId];
      } else {
        selectionSnapshots[nodeId] = { ...component };
      }
      engine.invalidate(nodeId);
    },
    rebuild(state = {}) {
      master.replaceRoots(sanitizeRoots(state.roots));
      collections = { ...cache.collections, ...(state.collections ?? {}) };
      selectionSnapshots = { ...(state.selections ?? {}) };
      engine = build();
      return engine;
    },
    reset(roots = {}) {
      master.replaceRoots(sanitizeRoots(roots));
      collections = { ...cache.collections };
      selectionSnapshots = {};
      engine = build();
      return engine;
    },
  };
}
