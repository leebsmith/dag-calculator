// Explicit-DAG runtime: adjacency from declared inputs/ref only, topological
// sort, lazy memoization. No read-tracking, no reactive inference.

import { evaluate } from "./ast.js";
import { BoundaryCache, canonicalFingerprint } from "./boundary.js";
import { domainStates, fieldDomainStates, collectionDomainStates } from "./domains.js";
import { resolveIngredientCollections, resolveIngredientRows } from "./ingredientPriors.js";
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
        if (r?.kind === "node") deps.push(r.nodeId);
      }
    } else if (node.kind === "selection") {
      const r = resolveReference(artifact, node.ref);
      if (r?.kind === "node") deps.push(r.nodeId);
    } else if (node.kind === "root" || node.kind === "choice") {
      // A default expression is evaluated lazily when the node is unset, so
      // any node it references is a real dependency (not a hidden one).
      for (const path of collectRefs(node.default)) {
        const r = resolveReference(artifact, path);
        if (r?.kind === "node") deps.push(r.nodeId);
      }
    }
    adjacency[id] = deps;
    for (const dep of deps) dependents[dep].push(id);
  }

  const topoOrder = topologicalSort(adjacency, dependents);
  return { adjacency, dependents, topoOrder };
}

// Collect every `{ref}` path appearing in an expression tree (defaults may be
// `{ref}`, `{const}`, `{call}`, `{lit}`, or nested operators).
function collectRefs(expr, out = []) {
  if (expr === null || typeof expr !== "object") return out;
  if (Array.isArray(expr)) {
    for (const item of expr) collectRefs(item, out);
    return out;
  }
  for (const [key, value] of Object.entries(expr)) {
    if (key === "ref" && typeof value === "string") out.push(value);
    else collectRefs(value, out);
  }
  return out;
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
  const identity = options.identity ?? {};
  if (Object.keys(artifact.identity ?? {}).length > 0 && Object.keys(identity).length === 0) {
    throw new Error(
      "identity is required: supply the equipment, water source, and style components"
    );
  }
  const roots = new Map(Object.entries(options.roots ?? {}));
  const references = options.references ?? {};
  // Resolved in place so the session's draft state (the same object) sees the
  // prior-resolved rows that the engine evaluates.
  const collections = resolveIngredientCollections(artifact, options.collections ?? {});
  const selections = options.selections ?? {};
  const boundaries = options.boundaries ?? {};
  const boundaryRequests = options.boundaryRequests ?? {};
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
    if (r.kind === "identity") {
      return getField(identity[r.namespace], r.suffix.join("."));
    }
    const node = artifact.nodes[r.nodeId];
    if (r.suffix.length === 0) return get(r.nodeId);
    if (node.kind === "boundary") {
      const value = get(r.nodeId);
      return value === undefined ? undefined : value.outputs[r.suffix.join(".")];
    }
    if (node.kind === "selection" || node.kind === "collection") {
      return getField(get(r.nodeId), r.suffix.join("."));
    }
    throw new Error(`Cannot resolve suffix "${r.suffix.join(".")}" on ${node.kind} node "${r.nodeId}"`);
  }

  // Resolve a boundary's request body. When the host registers a request
  // adapter for the node's binding (`options.boundaryRequests`), it reshapes the
  // resolved values into the backend's contract; otherwise the declared
  // `inputs` pass through unchanged (offline stubs). The SAME body feeds both
  // `boundaryRequest()` and evaluation, so their fingerprints agree.
  function resolveBoundaryInputs(node) {
    const build = boundaryRequests[node.binding];
    if (typeof build === "function") {
      return build({ get, resolve: resolveValue });
    }
    const inputs = {};
    for (const [alias, path] of Object.entries(node.inputs)) {
      inputs[alias] = resolveValue(path);
    }
    return inputs;
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
        // No component chosen: `""` is the canonical empty id, and a null batch
        // snapshot carries the same meaning. Resolve to null — absence, not an
        // empty object, so a missing component can never be mistaken for one
        // whose fields are all undefined.
        if (refValue === "" || refValue === undefined || refValue === null) return null;
        // A batch carries its own copy of every selected component; the library
        // is only consulted for legacy drafts without a snapshot.
        if (Object.prototype.hasOwnProperty.call(selections, nodeId)) {
          return selections[nodeId] === null ? null : { ...selections[nodeId] };
        }
        const component = references[node.output.schema]?.[refValue];
        if (component === undefined) {
          throw new Error(`Unknown reference "${refValue}" for selection "${nodeId}"`);
        }
        // A selection is a read-only view of its referenced seed component.
        return { ...component };
      }
      case "derived": {
        const inputValues = {};
        for (const [alias, path] of Object.entries(node.inputs)) {
          inputValues[alias] = resolveValue(path);
        }
        return evaluate(node.expr, derivedCtx(inputValues));
      }
      case "boundary": {
        const inputValues = resolveBoundaryInputs(node);
        if (
          Object.values(inputValues).some(
            (value) =>
              value === undefined ||
              value === null ||
              (typeof value === "number" && Number.isNaN(value))
          )
        ) {
          return undefined;
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
    identity,
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
    fieldDomainStates() {
      return fieldDomainStates(artifact, resolveValue);
    },
    collectionDomainStates() {
      return collectionDomainStates(artifact, get, resolveValue);
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
    // Remove an explicit value so the node falls back to its `default` (or has
    // no value at all when the default cannot resolve).
    unsetRoot(nodeId) {
      const kind = artifact.nodes[nodeId]?.kind;
      if (kind !== "root" && kind !== "choice") {
        throw new Error(`"${nodeId}" is not an unsettable root/choice node`);
      }
      if (!roots.delete(nodeId)) return;
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
      collections[nodeId] = resolveIngredientRows(artifact, nodeId, rows);
      invalidate(nodeId);
    },
    // Boundary seam (async host I/O lives in the adapter). Resolve a boundary's
    // declared inputs + canonical fingerprint without invoking it; seed its
    // outputs into the cache so subsequent sync evaluation hits the cache.
    boundaryRequest(nodeId) {
      const node = artifact.nodes[nodeId];
      if (!node || node.kind !== "boundary") {
        throw new Error(`"${nodeId}" is not a boundary node`);
      }
      const inputs = resolveBoundaryInputs(node);
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
