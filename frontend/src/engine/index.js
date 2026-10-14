// Engine public API: load + validate an artifact and build a calculator.

import { createEngine } from "./dag.js";
import { validateDerivedDimensions } from "./units.js";
import { validateArtifact } from "./validate.js";

export function loadArtifact(artifact) {
  validateArtifact(artifact);
  validateDerivedDimensions(artifact);
  return artifact;
}

export function createCalculator(artifact, options = {}) {
  return createEngine(loadArtifact(artifact), options);
}

export { createEngine, buildGraph, topologicalSort } from "./dag.js";
export { evaluate } from "./ast.js";
export { evaluatePredicate, relationStates } from "./relations.js";
export { checkDomain, domainStates, fieldDomainStates } from "./domains.js";
export { canonicalize, canonicalFingerprint, BoundaryCache } from "./boundary.js";
export { sha256Hex } from "./sha256.js";
export { getField, resolveReference } from "./paths.js";
export {
  toBase,
  fromBase,
  inferAddDimension,
  inferSubDimension,
  inferExprDimension,
  nodeDimension,
  validateDerivedDimensions,
} from "./units.js";
