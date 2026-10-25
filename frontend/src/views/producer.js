// Field-model producer barrel: the ONLY view module that reads the engine.
// Pure and DOM-free. Static projection and dynamic valuation live in
// `./producer/`; this file preserves the public exports.

export { projectFields, resolveCollectionColumns, displayValue } from "./producer/projection.js";
export { valuate, nonlinearFns, produce } from "./producer/valuation.js";
export { createFindingFormatter } from "./producer/finding.js";
