import { compileExpression } from "./expression.js";

function defaultPaths(node) {
  if (typeof node.default !== "string") return [];
  return compileExpression(node.default).paths;
}

function declaredRefs(node) {
  if (node.kind === "derived" || node.kind === "boundary") {
    return Object.values(node.inputs ?? {});
  }
  if (node.kind === "collection") {
    return Object.values(node.fields ?? {}).flatMap((spec) => Object.values(spec.inputs ?? {}));
  }
  if (node.kind === "selection") return node.ref ? [node.ref] : [];
  if (node.kind === "root" || node.kind === "choice") return defaultPaths(node);
  return [];
}

function identityNamespace(path, namespaces) {
  return namespaces.find((ns) => path === ns || path.startsWith(`${ns}.`)) ?? null;
}

function flatten(value, prefix, out) {
  if (Array.isArray(value)) {
    if (prefix) out.set(prefix, value);
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      flatten(nested, prefix ? `${prefix}.${key}` : key, out);
    }
    return;
  }
  if (prefix) out.set(prefix, value);
}

function same(left, right) {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return JSON.stringify(left) === JSON.stringify(right);
  }
  return false;
}

function walk(start, next) {
  const levels = [];
  const seen = new Set();
  let frontier = new Set(start);
  while (frontier.size > 0) {
    const level = [...frontier].filter((id) => !seen.has(id)).sort();
    if (level.length === 0) break;
    for (const id of level) seen.add(id);
    levels.push(level);
    const following = new Set();
    for (const id of level) {
      for (const candidate of next(id)) {
        if (!seen.has(candidate)) following.add(candidate);
      }
    }
    frontier = following;
  }
  return levels;
}

export function createImpact(artifact, graph) {
  const { adjacency, dependents } = graph;
  const namespaces = Object.keys(artifact.identity ?? {});
  const readers = new Map();
  const identityInputs = new Map();

  for (const [nodeId, node] of Object.entries(artifact.nodes)) {
    const found = new Set();
    for (const path of declaredRefs(node)) {
      const namespace = identityNamespace(path, namespaces);
      if (!namespace) continue;
      found.add(path);
      for (const key of [path, namespace]) {
        if (!readers.has(key)) readers.set(key, new Set());
        readers.get(key).add(nodeId);
      }
    }
    if (found.size > 0) identityInputs.set(nodeId, [...found].sort());
  }

  const boundaryIds = Object.keys(artifact.nodes)
    .filter((id) => artifact.nodes[id].kind === "boundary")
    .sort();

  function impact(source) {
    const known = Object.prototype.hasOwnProperty.call(artifact.nodes, source);
    const identity = readers.get(source);
    if (!known && !identity) {
      throw new Error(`Unknown impact source "${source}"`);
    }

    const direct = known ? [...(dependents[source] ?? [])] : [...identity];
    const downstream = direct.length > 0 ? walk(direct, (id) => dependents[id] ?? []) : [];
    const upstream = known ? walk(adjacency[source] ?? [], (id) => adjacency[id] ?? []) : [];

    const dependentsOut = downstream.flat();
    const ancestorsOut = upstream.flat();

    const fanOut = boundaryIds
      .filter((id) => dependentsOut.includes(id))
      .map((id) => ({ id, outputs: Object.keys(artifact.nodes[id].outputs ?? {}).length }));

    const identityPaths = new Set();
    for (const id of [source, ...ancestorsOut]) {
      for (const path of identityInputs.get(id) ?? []) identityPaths.add(path);
    }

    return {
      source,
      dependents: dependentsOut,
      ancestors: ancestorsOut,
      byDepth: downstream,
      boundaryFanOut: fanOut,
      boundaryUpstream: boundaryIds.filter((id) => ancestorsOut.includes(id)),
      identityInputs: [...identityPaths].sort(),
    };
  }

  return { impact };
}

export function diffValuations(before, after) {
  const left = new Map();
  const right = new Map();
  flatten(before, "", left);
  flatten(after, "", right);
  const paths = [...new Set([...left.keys(), ...right.keys()])].sort();
  const changed = [];
  for (const path of paths) {
    const from = left.get(path);
    const to = right.get(path);
    if (same(from, to)) continue;
    changed.push({ path, before: from, after: to });
  }
  return { changed };
}
