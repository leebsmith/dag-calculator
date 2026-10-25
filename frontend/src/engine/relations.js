// Relation evaluation (grammar §4.2). A relation is an n-ary predicate over
// nodes; the engine reports whether it holds. Report-only (never throws on a
// violated invariant).

import { evaluate } from "./ast.js";

// Relations write binary comparisons as { op, lhs, rhs }; the interpreter uses
// { op, args }. Normalize recursively so either form evaluates.
function normalize(node) {
  if (node === null || typeof node !== "object") return node;
  if (Array.isArray(node)) return node.map(normalize);
  if ("lhs" in node && "rhs" in node) {
    return { op: node.op, args: [normalize(node.lhs), normalize(node.rhs)] };
  }
  const out = {};
  for (const [k, v] of Object.entries(node)) out[k] = normalize(v);
  return out;
}

export function evaluatePredicate(artifact, predicate, resolveRef) {
  const ctx = {
    resolveRef,
    resolveConst: (id) => artifact.constants?.[id]?.value,
    call: (id) => {
      throw new Error(`A relation predicate must not call a function ("${id}")`);
    },
  };
  return Boolean(evaluate(normalize(predicate), ctx));
}

export function relationStates(artifact, resolveRef) {
  return (artifact.relations ?? []).map((relation) => ({
    id: relation.id,
    holds: evaluatePredicate(artifact, relation.predicate, resolveRef),
    blocking: relation.blocking === true,
  }));
}
