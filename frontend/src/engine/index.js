// Engine public API: load + validate an artifact and build a calculator.

import { createEngine } from "./dag.js";
import { validateDerivedDimensions, validateCollectionFields, validateRootDefaults } from "./units.js";
import { validateArtifact } from "./validate.js";

const validated = new WeakSet();

export function loadArtifact(artifact) {
  if (!validated.has(artifact)) {
    validateArtifact(artifact);
    validateRootDefaults(artifact);
    validateDerivedDimensions(artifact);
    validateCollectionFields(artifact);
    validated.add(artifact);
  }
  return artifact;
}

export function createCalculator(artifact, options = {}) {
  return createEngine(loadArtifact(artifact), options);
}

export { createEngine, buildGraph, topologicalSort } from "./dag.js";
export { evaluate } from "./ast.js";
export { evaluatePredicate, relationStates } from "./relations.js";
export { checkDomain, domainStates, fieldDomainStates, collectionDomainStates } from "./domains.js";
export { canonicalize, canonicalFingerprint, BoundaryCache } from "./boundary.js";
export { sha256Hex } from "./sha256.js";
export { getField, refKey, resolveReference } from "./paths.js";
export {
  toBase,
  fromBase,
  inferAddDimension,
  inferSubDimension,
  inferExprDimension,
  nodeDimension,
  valueSpecOf,
  validateDerivedDimensions,
  validateCollectionFields,
  validateRootDefaults,
} from "./units.js";
