// Unary domain-bound evaluation (grammar §4.1). Bounds restrict a node's valid
// values; the engine reports whether the current value satisfies them.
// Report-only (never throws).

import { runtimeFor } from "./expression.js";

function unresolvedLimit(artifact, domain, resolveRef) {
  const runtime = runtimeFor(artifact);
  return runtime.compile(domain).paths.some((path) => {
    if (path === "$value" || path === "$context" || path === "constants") return false;
    if (path.startsWith("constants.")) return false;
    const limit = resolveRef(path);
    return limit === undefined || limit === null || (typeof limit === "number" && Number.isNaN(limit));
  });
}

// Evaluate a domain spec against a value. A bound that cannot be resolved
// (e.g. a ref to a field of an unset optional selection) is treated as
// "not applicable" and skipped, rather than failing the value.
function evaluateDomain(artifact, domain, value, resolveRef) {
  if (value === undefined || value === null) {
    return { bounded: true, holds: null, reason: "unresolved" };
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return { bounded: true, holds: false, reason: "non-finite" };
  }
  if (typeof domain !== "string") {
    throw new Error("Domain must be a Jexl string");
  }
  if (unresolvedLimit(artifact, domain, resolveRef)) {
    return { bounded: true, holds: true };
  }
  const runtime = runtimeFor(artifact);
  const scope = runtime.scope(resolveRef, { $value: value });
  return { bounded: true, holds: Boolean(runtime.evaluate(domain, scope)) };
}

export function checkDomain(artifact, nodeId, value, resolveRef = () => undefined) {
  const node = artifact.nodes[nodeId];
  const domain = node?.domain;
  if (!domain) return { nodeId, bounded: false, holds: true };
  return { nodeId, ...evaluateDomain(artifact, domain, value, resolveRef) };
}

// Evaluate a raw domain spec (as declared on a primitive-schema field) against a
// value. Component fields carry literal bounds, never refs (a component is
// self-contained), so the ref resolver is a no-op. This is the single source of
// truth for component-field domain checks on the frontend.
export function checkComponentDomain(artifact, domain, value) {
  if (!domain) return { bounded: false, holds: true };
  return evaluateDomain(artifact, domain, value, () => undefined);
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
        states.push({
          nodeId: id,
          index,
          field,
          ...evaluateDomain(artifact, spec.domain, value, resolveRef),
        });
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
      states.push({
        selectionNodeId: id,
        field,
        ...evaluateDomain(artifact, spec.domain, value, resolveRef),
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
      states.push({
        namespace,
        field,
        ...evaluateDomain(artifact, spec.domain, value, resolveRef),
      });
    }
  }
  return states;
}
