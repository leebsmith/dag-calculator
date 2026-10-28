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

// Evaluate a domain spec against a value. A bound that cannot be resolved
// (e.g. a {ref} to a field of an unset optional selection) is treated as
// "not applicable" and skipped, rather than failing the value.
function evaluateDomain(domain, value, resolveLimitFn) {
  // No value yet: absence is not a violation. Only an actually-invalid value is.
  if (value === undefined || value === null) {
    return { bounded: true, holds: null, reason: "unresolved" };
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return { bounded: true, holds: false, reason: "non-finite" };
  }
  for (const [op, limitExpr] of Object.entries(domain)) {
    const test = OPS[op];
    if (!test) continue;
    const limit = resolveLimitFn(limitExpr);
    if (limit === undefined || limit === null || Number.isNaN(limit)) continue;
    if (!test(value, limit)) return { bounded: true, holds: false, op, limit };
  }
  return { bounded: true, holds: true };
}

export function checkDomain(artifact, nodeId, value, resolveRef) {
  const node = artifact.nodes[nodeId];
  const domain = node?.domain;
  if (!domain) return { nodeId, bounded: false, holds: true };
  const resolveLimitFn = (limit) => resolveLimit(limit, artifact, resolveRef);
  return { nodeId, ...evaluateDomain(domain, value, resolveLimitFn) };
}

// Evaluate a raw domain spec (as declared on a primitive-schema field) against a
// value. Component fields carry `{const}`/literal bounds, never `{ref}` (a
// component is self-contained), so the ref resolver is a no-op. This is the
// single source of truth for component-field domain checks on the frontend.
export function checkComponentDomain(artifact, domain, value) {
  if (!domain || typeof domain !== "object") return { bounded: false, holds: true };
  const resolveLimitFn = (limit) => resolveLimit(limit, artifact, () => undefined);
  return evaluateDomain(domain, value, resolveLimitFn);
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

// Domain states for the *items* of collections. A collection's item schema may
// declare per-field `domain`s (e.g. grist_row.pct in [0,1]); blank cells are
// skipped. (The parts -> pct allocation itself is a host-side formulation rule.)
export function collectionDomainStates(artifact, get, resolveRef) {
  const states = [];
  const schemas = artifact.primitive_schemas ?? {};
  for (const [id, node] of Object.entries(artifact.nodes)) {
    if (node.kind !== "collection") continue;
    const schema = schemas[node.item_schema] ?? {};
    const bounded = Object.entries(schema).filter(([, spec]) => spec.domain);
    if (!bounded.length) continue;
    const rows = get(id) ?? [];
    rows.forEach((row, index) => {
      for (const [field, spec] of bounded) {
        const value = row?.[field];
        if (value === undefined || value === null || value === "") continue;
        const resolveLimitFn = (limit) => resolveLimit(limit, artifact, resolveRef);
        states.push({ nodeId: id, index, field, ...evaluateDomain(spec.domain, value, resolveLimitFn) });
      }
    });
  }
  return states;
}

// Domain states for the *fields* of selected components. A selection is a
// read-only view of a seed component; its schema may declare per-field
// `domain`s. Fields of an unset optional selection are skipped (the component
// resolves to `{}`, so the field reads as undefined).
export function fieldDomainStates(artifact, resolveRef) {
  const states = [];
  const schemas = artifact.primitive_schemas ?? {};
  for (const [id, node] of Object.entries(artifact.nodes)) {
    if (node.kind !== "selection") continue;
    const schema = schemas[node.output?.schema] ?? {};
    for (const [field, spec] of Object.entries(schema)) {
      if (!spec.domain) continue;
      let value;
      try {
        value = resolveRef(`${id}.${field}`);
      } catch {
        continue; // unguarded/unresolvable reference — not applicable
      }
      if (value === undefined) continue; // selection unset or field absent
      const resolveLimitFn = (limit) => resolveLimit(limit, artifact, resolveRef);
      states.push({
        selectionNodeId: id,
        field,
        ...evaluateDomain(spec.domain, value, resolveLimitFn),
      });
    }
  }
  for (const [namespace, schemaId] of Object.entries(artifact.identity ?? {})) {
    const schema = schemas[schemaId] ?? {};
    for (const [field, spec] of Object.entries(schema)) {
      if (!spec.domain) continue;
      let value;
      try {
        value = resolveRef(`${namespace}.${field}`);
      } catch {
        continue;
      }
      if (value === undefined) continue;
      const resolveLimitFn = (limit) => resolveLimit(limit, artifact, resolveRef);
      states.push({
        namespace,
        field,
        ...evaluateDomain(spec.domain, value, resolveLimitFn),
      });
    }
  }
  return states;
}
