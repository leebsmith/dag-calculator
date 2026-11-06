// The catalog card layer factories: each returns the draft layer plus the card
// layer, and together they cover exactly the card's declared surface. The
// factories never receive an app; composition belongs to the root.

import test from "node:test";
import assert from "node:assert/strict";

import { createCatalogRegistry } from "../../frontend/src/adapters/cards/catalogChrome.js";
import { createMaltLayers, KEYS as MALT_KEYS } from "../../frontend/src/adapters/cards/malt.js";
import {
  createTraceMaltsLayers,
  KEYS as TRACE_KEYS,
} from "../../frontend/src/adapters/cards/trace-malts.js";
import {
  createDryHopLayers,
  KEYS as DRY_HOP_KEYS,
} from "../../frontend/src/adapters/cards/dry-hops.js";
import {
  createLateAdditionsLayers,
  KEYS as LATE_ADDITIONS_KEYS,
} from "../../frontend/src/adapters/cards/late-additions.js";
import { createHopLayers, KEYS as HOP_KEYS } from "../../frontend/src/adapters/cards/hops.js";

function context() {
  return {
    artifact: { nodes: {}, primitive_schemas: {}, taxonomies: {} },
    cache: { seeds: {} },
    engine: {},
    ui: { unitMode: {} },
    observability: { reportError() {} },
    getView: () => ({}),
    registry: createCatalogRegistry(),
  };
}

function layerKeys(layers) {
  return new Set(layers.flatMap((layer) => Object.getOwnPropertyNames(layer)));
}

const CASES = [
  ["malt", createMaltLayers, MALT_KEYS, "grist.major_malts"],
  ["trace", createTraceMaltsLayers, TRACE_KEYS, "grist.trace_malts"],
  ["dryHop", createDryHopLayers, DRY_HOP_KEYS, "batch.dry_hops"],
  ["sugar", createLateAdditionsLayers, LATE_ADDITIONS_KEYS, "batch.sugars"],
  ["hop", createHopLayers, HOP_KEYS, "batch.boil_hops"],
];

test("each layer factory covers exactly the card's declared surface", () => {
  for (const [name, factory, keys, nodeId] of CASES) {
    const ctx = context();
    const layers = factory(ctx);

    assert.ok(Array.isArray(layers), `${name}: returns a layer list`);
    assert.ok(layers.length >= 2, `${name}: draft layer plus card layer`);
    assert.deepEqual(
      [...layerKeys(layers)].sort(),
      [...keys].sort(),
      `${name}: layers cover the declared surface`
    );
    assert.ok(ctx.registry.get(nodeId), `${name}: draft entry registered`);
  }
});

test("the hop factory also returns the cooling-curve picker", () => {
  const layers = createHopLayers(context());
  const keys = layerKeys(layers);

  assert.ok(keys.has("coolingCurveId"));
  assert.ok(keys.has("coolingCurveSummary"));
  assert.ok(keys.has("selectCoolingCurve"));
});
