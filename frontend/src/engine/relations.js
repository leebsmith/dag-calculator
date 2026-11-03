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

// An operand with no realized value gives the predicate no verdict: a boundary
// that did not solve degrades its outputs to undefined, and arithmetic through
// them yields NaN. Neither is a violation (engine/domains.js draws the same
// line for a missing value).
function isUnrealized(value) {
  if (value === undefined || value === null) return true;
  return typeof value === "number" && !Number.isFinite(value);
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
  return (artifact.relations ?? []).map((relation) => {
    // Record only the operands the predicate actually reads, so a short-circuited
    // branch is never resolved and an unset optional selection cannot throw.
    const seen = [];
    const holds = evaluatePredicate(artifact, relation.predicate, (path) => {
      const value = resolveRef(path);
      seen.push(value);
      return value;
    });
    const realized = !seen.some(isUnrealized);
    // A false verdict over an unrealized operand is not a verdict at all.
    const value = holds || realized ? holds : null;
    return { id: relation.id, holds: value, blocking: relation.blocking === true };
  });
}
