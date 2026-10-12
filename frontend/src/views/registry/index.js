import { mashRegistry } from "./mash.js";

// Presentation registry: node id -> { label, unit?, control? }. Per-slice
// modules composed here. References artifact ids one-way (presentation never
// flows back into the artifact).
export const registry = {
  ...mashRegistry,
};
