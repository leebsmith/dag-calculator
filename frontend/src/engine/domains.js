// Unary domain-bound evaluation (grammar §4.1). Bounds restrict a node's valid
// values; the engine reports whether the current value satisfies them.
// Report-only (never throws).

const OPS = {
  gt: (a, b) => a > b,
  gte: (a, b) => a >= b,
  lt: (a, b) => a < b,
  lte: (a, b) => a <= b,
  eq: (a, b) => a === b,
  ne: (a, b) => a !== b,
};

function resolveLimit(limit, artifact, resolveRef) {
  if (typeof limit === "number") return limit;
  if (limit && typeof limit === "object") {
    if ("const" in limit) return artifact.constants?.[limit.const]?.value;
    if ("ref" in limit) return resolveRef(limit.ref);
  }
  return undefined;
}

export function checkDomain(artifact, nodeId, value, resolveRef) {
  const node = artifact.nodes[nodeId];
  const domain = node?.domain;
  if (!domain) return { nodeId, bounded: false, holds: true };
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return { nodeId, bounded: true, holds: false, reason: "non-finite" };
  }
  for (const [op, limitExpr] of Object.entries(domain)) {
    const test = OPS[op];
    if (!test) continue;
    const limit = resolveLimit(limitExpr, artifact, resolveRef);
    if (!test(value, limit)) {
      return { nodeId, bounded: true, holds: false, op, limit };
    }
  }
  return { nodeId, bounded: true, holds: true };
}

export function domainStates(artifact, get, resolveRef) {
  const states = [];
  for (const [id, node] of Object.entries(artifact.nodes)) {
    if ((node.kind === "root" || node.kind === "choice") && node.domain) {
      states.push(checkDomain(artifact, id, get(id), resolveRef));
    }
  }
  return states;
}
