import { batchRegistry } from "./batch.js";
import { dryHopsRegistry } from "./dry-hops.js";
import { equipmentRegistry } from "./equipment.js";
import { fermentablesRegistry } from "./fermentables.js";
import { hopsRegistry } from "./hops.js";
import { lateAdditionsRegistry } from "./late-additions.js";
import { mashRegistry } from "./mash.js";
import { styleRegistry } from "./style.js";
import { waterRegistry } from "./water.js";
import { yeastRegistry } from "./yeast.js";

// Presentation registry: node id / dotted path -> { label, unit?, control? }.
// Per-slice modules composed here. References artifact ids one-way (presentation
// never flows back into the artifact).
export const registry = {
  ...equipmentRegistry,
  ...yeastRegistry,
  ...fermentablesRegistry,
  ...hopsRegistry,
  ...lateAdditionsRegistry,
  ...batchRegistry,
  ...mashRegistry,
  ...styleRegistry,
  ...waterRegistry,
  ...dryHopsRegistry,
};
