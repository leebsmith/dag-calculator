import { generatedRegistry } from "./generated.js";

// Presentation registry: node id / dotted path -> { label, unit?, control? }.
// Generated from `data/labels.json` by `scripts/emit-registry.mjs`; the
// emitter derives the shared option labels from the seed tables. References
// artifact ids one-way (presentation never flows back into the artifact).
export const registry = generatedRegistry;
