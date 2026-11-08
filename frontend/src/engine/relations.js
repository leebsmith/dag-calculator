// Relation evaluation (grammar §4.2). A relation is an n-ary predicate over
// nodes; the engine reports whether it holds. Report-only (never throws on a
// violated invariant).

import { runtimeFor } from "./expression.js";

// An operand with no realized value gives the predicate no verdict: a boundary
// that did not solve degrades its outputs to undefined, and arithmetic through
// them yields NaN. Neither is a violation (engine/domains.js draws the same
// line for a missing value).
function isUnrealized(value) {
  if (value === undefined || value === null) return true;
  return typeof value === "number" && !Number.isFinite(value);
}

export function evaluatePredicate(artifact, predicate, resolveRef) {
  const runtime = runtimeFor(artifact);
  return Boolean(runtime.evaluate(predicate, runtime.scope(resolveRef)));
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
