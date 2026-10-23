// Dotted-path resolution (grammar §1.1) and shared field access.

export function getField(obj, path) {
  if (obj === null || obj === undefined) return undefined;
  if (path === "" || path === undefined) return obj;
  const segments = path.split(".");
  let current = obj;
  for (const seg of segments) {
    if (current === null || current === undefined) return undefined;
    current = current[seg];
  }
  return current;
}

// Resolve a dotted path to either a graph node (plus an optional selection /
// collection field or boundary output suffix) or an identity namespace declared
// in `artifact.identity` (plus a component-field suffix). Longest-prefix match,
// nodes before identity namespaces.
export function resolveReference(artifact, path) {
  const nodes = artifact.nodes;
  if (Object.prototype.hasOwnProperty.call(nodes, path)) {
    return { kind: "node", nodeId: path, suffix: [], path };
  }

  const segments = path.split(".");
  for (let i = segments.length - 1; i >= 1; i--) {
    const prefix = segments.slice(0, i).join(".");
    if (Object.prototype.hasOwnProperty.call(nodes, prefix)) {
      return { kind: "node", nodeId: prefix, suffix: segments.slice(i), path };
    }
  }

  const identity = artifact.identity ?? {};
  for (let i = segments.length; i >= 1; i--) {
    const prefix = segments.slice(0, i).join(".");
    if (Object.prototype.hasOwnProperty.call(identity, prefix)) {
      return { kind: "identity", namespace: prefix, suffix: segments.slice(i), path };
    }
  }

  return null;
}

// The canonical key for a resolved reference: the original path, so node and
// identity paths share one key space (used for field-domain lookups).
export function refKey(ref) {
  return ref ? ref.path : null;
}
