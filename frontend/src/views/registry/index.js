import { batchRegistry } from "./batch.js";
import { equipmentRegistry } from "./equipment.js";
import { mashRegistry } from "./mash.js";

// Presentation registry: node id / dotted path -> { label, unit?, control? }.
// Per-slice modules composed here. References artifact ids one-way (presentation
// never flows back into the artifact).
export const registry = {
  ...equipmentRegistry,
  ...batchRegistry,
  ...mashRegistry,
};
