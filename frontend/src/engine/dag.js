// Explicit-DAG runtime: adjacency from declared inputs/ref only, topological
// sort, lazy memoization. No read-tracking, no reactive inference.

import { evaluate } from "./ast.js";
import { BoundaryCache, canonicalFingerprint } from "./boundary.js";
import { domainStates } from "./domains.js";
import { getField, resolveReference } from "./paths.js";
import { relationStates } from "./relations.js";

export function buildGraph(artifact) {
  const adjacency = {};
  const dependents = {};
  for (const id of Object.keys(artifact.nodes)) {
    adjacency[id] = [];
    dependents[id] = [];
  }

  for (const [id, node] of Object.entries(artifact.nodes)) {
    const deps = [];
    if (node.kind === "derived" || node.kind === "boundary") {
      for (const path of Object.values(node.inputs)) {
        const r = resolveReference(artifact, path);
        if (r) deps.push(r.nodeId);
      }
    } else if (node.kind === "selection") {
      const r = resolveReference(artifact, node.ref);
      if (r) deps.push(r.nodeId);
    }
    adjacency[id] = deps;
    for (const dep of deps) dependents[dep].push(id);
  }

  const topoOrder = topologicalSort(adjacency, dependents);
  return { adjacency, dependents, topoOrder };
}

export function topologicalSort(adjacency, dependents) {
  const indegree = {};
  for (const id of Object.keys(adjacency)) indegree[id] = adjacency[id].length;

  const queue = Object.keys(adjacency).filter((id) => indegree[id] === 0);
  const order = [];
  while (queue.length) {
    const id = queue.shift();
    order.push(id);
    for (const dependent of dependents[id] ?? []) {
      indegree[dependent]--;
      if (indegree[dependent] === 0) queue.push(dependent);
    }
  }
  if (order.length !== Object.keys(adjacency).length) {
    throw new Error("Cycle detected in the artifact DAG");
  }
  return order;
}

export function createEngine(artifact, options = {}) {
  const roots = new Map(Object.entries(options.roots ?? {}));
  const references = options.references ?? {};
  const collections = options.collections ?? {};
  const overlays = options.overlays ?? {};
  const boundaries = options.boundaries ?? {};
  const boundaryCache = options.boundaryCache ?? new BoundaryCache();

  const { adjacency, dependents, topoOrder } = buildGraph(artifact);
  const memo = new Map();

  function invalidate(nodeId) {
    if (!memo.has(nodeId)) return;
    memo.delete(nodeId);
    for (const dependent of dependents[nodeId] ?? []) invalidate(dependent);
  }

  function get(nodeId) {
    if (!Object.prototype.hasOwnProperty.call(artifact.nodes, nodeId)) {
      throw new Error(`Unknown node "${nodeId}"`);
    }
    if (memo.has(nodeId)) return memo.get(nodeId);
    const value = evaluateNode(nodeId);
    memo.set(nodeId, value);
    return value;
  }

  function resolveValue(path) {
    const r = resolveReference(artifact, path);
    if (!r) throw new Error(`Unresolved reference "${path}"`);
    const node = artifact.nodes[r.nodeId];
    if (r.suffix.length === 0) return get(r.nodeId);
    if (node.kind === "boundary") {
      return get(r.nodeId).outputs[r.suffix.join(".")];
    }
    if (node.kind === "selection" || node.kind === "collection") {
      return getField(get(r.nodeId), r.suffix.join("."));
    }
    throw new Error(`Cannot resolve suffix "${r.suffix.join(".")}" on ${node.kind} node "${r.nodeId}"`);
  }

  function callFunction(fnId, args) {
    const fn = artifact.functions[fnId];
    if (!fn) throw new Error(`Unknown function "${fnId}"`);
    const ctx = {
      resolveRef(name) {
        const idx = fn.params.indexOf(name);
        if (idx === -1) throw new Error(`Unknown parameter "${name}" in function "${fnId}"`);
        return args[idx];
      },
      resolveConst(id) {
        return artifact.constants[id].value;
      },
      call(subId, subArgs) {
        return callFunction(subId, subArgs);
      },
    };
    return evaluate(fn.body, ctx);
  }

  const topLevelCtx = {
    resolveRef(name) {
      return resolveValue(name);
    },
    resolveConst(id) {
      return artifact.constants[id].value;
    },
    call(fnId, args) {
      return callFunction(fnId, args);
    },
  };

  function derivedCtx(inputValues) {
    return {
      resolveRef(name) {
        if (Object.prototype.hasOwnProperty.call(inputValues, name)) return inputValues[name];
        return resolveValue(name);
      },
      resolveConst(id) {
        return artifact.constants[id].value;
      },
      call(fnId, args) {
        return callFunction(fnId, args);
      },
    };
  }

  function evaluateNode(nodeId) {
    const node = artifact.nodes[nodeId];
    switch (node.kind) {
      case "root":
      case "choice":
        return roots.has(nodeId) ? roots.get(nodeId) : evaluate(node.default, topLevelCtx);
      case "collection":
        return collections[nodeId] ?? [];
      case "selection": {
        const refValue = get(node.ref);
        const component = references[node.schema]?.[refValue];
        if (component === undefined) {
          throw new Error(`Unknown reference "${refValue}" for selection "${nodeId}"`);
        }
        // component < artifact overlay < mutable (user) overlay
        return { ...component, ...(node.overlay ?? {}), ...(overlays[nodeId] ?? {}) };
      }
      case "derived": {
        const inputValues = {};
        for (const [alias, path] of Object.entries(node.inputs)) {
          inputValues[alias] = resolveValue(path);
        }
        return evaluate(node.expr, derivedCtx(inputValues));
      }
      case "boundary": {
        const inputValues = {};
        for (const [alias, path] of Object.entries(node.inputs)) {
          inputValues[alias] = resolveValue(path);
        }
        const fingerprint = canonicalFingerprint(inputValues);
        if (boundaryCache.has(fingerprint)) return boundaryCache.get(fingerprint);
        const fn = boundaries[node.binding];
        if (typeof fn !== "function") {
          throw new Error(
            `No boundary binding registered for "${node.binding}" (result not pre-resolved)`
          );
        }
        const outputs = fn(inputValues, { artifact });
        const result = { outputs, fingerprint };
        boundaryCache.set(fingerprint, result);
        return result;
      }
      default:
        throw new Error(`Unknown node kind "${node.kind}"`);
    }
  }

  return {
    get,
    resolve: resolveValue,
    call(fnId, args) {
      return callFunction(fnId, args);
    },
    relationStates() {
      return relationStates(artifact, resolveValue);
    },
    domainStates() {
      return domainStates(artifact, get, resolveValue);
    },
    topoOrder,
    adjacency,
    dependents,
    setRoot(nodeId, value) {
      const kind = artifact.nodes[nodeId]?.kind;
      if (kind !== "root" && kind !== "choice") {
        throw new Error(`"${nodeId}" is not a settable root/choice node`);
      }
      roots.set(nodeId, value);
      invalidate(nodeId);
    },
    getRoot(nodeId) {
      return roots.get(nodeId);
    },
    hasRoot(nodeId) {
      return roots.has(nodeId);
    },
    setCollection(nodeId, rows) {
      if (artifact.nodes[nodeId]?.kind !== "collection") {
        throw new Error(`"${nodeId}" is not a collection node`);
      }
      collections[nodeId] = rows;
      invalidate(nodeId);
    },
    setOverlay(selectionNodeId, field, value) {
      if (artifact.nodes[selectionNodeId]?.kind !== "selection") {
        throw new Error(`"${selectionNodeId}" is not a selection node`);
      }
      overlays[selectionNodeId] = { ...(overlays[selectionNodeId] ?? {}), [field]: value };
      invalidate(selectionNodeId);
    },
    clearOverlay(selectionNodeId, field) {
      if (overlays[selectionNodeId]) {
        delete overlays[selectionNodeId][field];
        invalidate(selectionNodeId);
      }
    },
    getOverlay(selectionNodeId) {
      return overlays[selectionNodeId] ?? {};
    },
    // Boundary seam (async host I/O lives in the adapter). Resolve a boundary's
    // declared inputs + canonical fingerprint without invoking it; seed its
    // outputs into the cache so subsequent sync evaluation hits the cache.
    boundaryRequest(nodeId) {
      const node = artifact.nodes[nodeId];
      if (!node || node.kind !== "boundary") {
        throw new Error(`"${nodeId}" is not a boundary node`);
      }
      const inputs = {};
      for (const [alias, path] of Object.entries(node.inputs)) {
        inputs[alias] = resolveValue(path);
      }
      return { binding: node.binding, inputs, fingerprint: canonicalFingerprint(inputs) };
    },
    applyBoundaryResult(fingerprint, outputs) {
      boundaryCache.set(fingerprint, { outputs, fingerprint });
    },
    hasBoundaryResult(fingerprint) {
      return boundaryCache.has(fingerprint);
    },
    invalidate,
  };
}
