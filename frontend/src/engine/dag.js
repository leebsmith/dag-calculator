// Explicit-DAG runtime: adjacency from declared inputs/ref only, topological
// sort, lazy memoization. No read-tracking, no reactive inference.

import { evaluate } from "./ast.js";
import { BoundaryCache, canonicalFingerprint } from "./boundary.js";
import { domainStates, fieldDomainStates, collectionDomainStates } from "./domains.js";
import { resolveIngredientCollections, resolveIngredientRows } from "./ingredientPriors.js";
import { getField, resolveReference } from "./paths.js";
import { relationStates } from "./relations.js";

const graphs = new WeakMap();

export function buildGraph(artifact) {
  const cached = graphs.get(artifact);
  if (cached) return cached;
  const graph = constructGraph(artifact);
  graphs.set(artifact, graph);
  return graph;
}

function constructGraph(artifact) {
  const adjacency = {};
  const dependents = {};
  for (const id of Object.keys(artifact.nodes)) {
    adjacency[id] = [];
    dependents[id] = [];
  }

  for (const [id, node] of Object.entries(artifact.nodes)) {
    const deps = [];
    const readDeps = [];
    if (node.kind === "derived" || node.kind === "boundary") {
      for (const path of Object.values(node.inputs)) {
        const r = resolveReference(artifact, path);
        if (r?.kind === "node") deps.push(r.nodeId);
      }
    } else if (node.kind === "collection") {
      // A computed row field is a read-side overlay: it never feeds another
      // node, so its inputs are invalidation edges only. They are resolved
      // against authored rows (semantics.md §2.4), so a field may read the very
      // boundary its collection feeds without closing an evaluation cycle.
      for (const spec of Object.values(node.fields ?? {})) {
        for (const path of Object.values(spec.inputs ?? {})) {
          const r = resolveReference(artifact, path);
          if (r?.kind === "node") readDeps.push(r.nodeId);
        }
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
    adjacency[id] = [...new Set(deps)];
    for (const dep of adjacency[id]) dependents[dep].push(id);
    for (const dep of new Set(readDeps)) {
      if (!dependents[dep].includes(id)) dependents[dep].push(id);
    }
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
  // Two valuations: the default reads every node in full (collections carry
  // their computed row fields); `authored` mode strips those overlays, which is
  // what a boundary request and a computed field's own inputs must see.
  const memo = new Map();
  const authoredMemo = new Map();

  function invalidate(nodeId, seen = new Set()) {
    if (seen.has(nodeId)) return;
    seen.add(nodeId);
    memo.delete(nodeId);
    authoredMemo.delete(nodeId);
    for (const dependent of dependents[nodeId] ?? []) invalidate(dependent, seen);
  }

  function get(nodeId, authored = false) {
    if (!Object.prototype.hasOwnProperty.call(artifact.nodes, nodeId)) {
      throw new Error(`Unknown node "${nodeId}"`);
    }
    const cache = authored ? authoredMemo : memo;
    if (cache.has(nodeId)) return cache.get(nodeId);
    const value = evaluateNode(nodeId, authored);
    cache.set(nodeId, value);
    return value;
  }

  function resolveValue(path, authored = false) {
    const r = resolveReference(artifact, path);
    if (!r) throw new Error(`Unresolved reference "${path}"`);
    if (r.kind === "identity") {
      return getField(identity[r.namespace], r.suffix.join("."));
    }
    const node = artifact.nodes[r.nodeId];
    if (r.suffix.length === 0) return get(r.nodeId, authored);
    if (node.kind === "boundary") {
      const value = get(r.nodeId, authored);
      return value === undefined ? undefined : value.outputs[r.suffix.join(".")];
    }
    if (node.kind === "selection" || node.kind === "collection") {
      return getField(get(r.nodeId, authored), r.suffix.join("."));
    }
    throw new Error(`Cannot resolve suffix "${r.suffix.join(".")}" on ${node.kind} node "${r.nodeId}"`);
  }

  // Resolve a boundary's request body. When the host registers a request
  // adapter for the node's binding (`options.boundaryRequests`), it reshapes the
  // resolved values into the backend's contract; otherwise the declared
  // `inputs` pass through unchanged (offline stubs). The SAME body feeds both
  // `boundaryRequest()` and evaluation, so their fingerprints agree. Inputs are
  // always read in authored mode: a request never carries a computed row field.
  function resolveBoundaryInputs(node) {
    const build = boundaryRequests[node.binding];
    const read = { get: (id) => get(id, true), resolve: (path) => resolveValue(path, true) };
    if (typeof build === "function") {
      return build(read);
    }
    const inputs = {};
    for (const [alias, path] of Object.entries(node.inputs)) {
      inputs[alias] = read.resolve(path);
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

  function topLevelCtxFor(authored) {
    return {
      resolveRef(name) {
        return resolveValue(name, authored);
      },
      resolveConst(id) {
        return artifact.constants[id].value;
      },
      call(fnId, args) {
        return callFunction(fnId, args);
      },
    };
  }

  function derivedCtx(inputValues, row = null, authored = false) {
    return {
      resolveRef(name) {
        if (row) {
          if (name === "row") return row;
          if (name.startsWith("row.")) return getField(row, name.slice("row.".length));
        }
        if (Object.prototype.hasOwnProperty.call(inputValues, name)) return inputValues[name];
        return resolveValue(name, authored);
      },
      resolveConst(id) {
        return artifact.constants[id].value;
      },
      call(fnId, args) {
        return callFunction(fnId, args);
      },
    };
  }

  // Row-scoped computed fields, evaluated per row on read. They are derived
  // values: materialized into a copy of the row, never written into collection
  // state (semantics.md §2.4). Inputs are read in authored mode, so a field may
  // read the boundary its collection feeds without recursing into itself.
  function computedRowFields(node, row) {
    const values = {};
    for (const [name, spec] of Object.entries(node.fields)) {
      const inputValues = {};
      for (const [alias, path] of Object.entries(spec.inputs)) {
        inputValues[alias] = resolveValue(path, true);
      }
      values[name] = evaluate(spec.expr, derivedCtx(inputValues, row, true));
    }
    return values;
  }

  function evaluateNode(nodeId, authored = false) {
    const node = artifact.nodes[nodeId];
    switch (node.kind) {
      case "root":
      case "choice":
        return roots.has(nodeId)
          ? roots.get(nodeId)
          : evaluate(node.default, topLevelCtxFor(authored));
      case "collection": {
        const rows = collections[nodeId] ?? [];
        if (authored || !node.fields) return rows;
        return rows.map((row) => ({ ...row, ...computedRowFields(node, row) }));
      }
      case "selection": {
        const refValue = get(node.ref, authored);
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
          inputValues[alias] = resolveValue(path, authored);
        }
        return evaluate(node.expr, derivedCtx(inputValues, null, authored));
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
    // Authored-node read: collections omit their computed row fields. The
    // boundary seam and computed fields read this way (semantics.md §2.4).
    getAuthored(nodeId) {
      return get(nodeId, true);
    },
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
