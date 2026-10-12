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

// Resolve a dotted reference path to a node id plus an optional field/output
// suffix. Longest-prefix match over declared node ids, with a slice-level
// fallback for selection nodes (e.g. "equipment.mash_tun_specific_heat" ->
// selection node "equipment.profile", suffix "mash_tun_specific_heat").
export function resolveReference(artifact, path) {
  const nodes = artifact.nodes;
  if (Object.prototype.hasOwnProperty.call(nodes, path)) {
    return { nodeId: path, suffix: [] };
  }

  const segments = path.split(".");
  for (let i = segments.length - 1; i >= 1; i--) {
    const prefix = segments.slice(0, i).join(".");
    if (Object.prototype.hasOwnProperty.call(nodes, prefix)) {
      return { nodeId: prefix, suffix: segments.slice(i) };
    }
  }

  const slice = segments[0];
  for (const [id, node] of Object.entries(nodes)) {
    if (node.kind === "selection" && id.split(".")[0] === slice) {
      return { nodeId: id, suffix: segments.slice(1) };
    }
  }

  return null;
}
