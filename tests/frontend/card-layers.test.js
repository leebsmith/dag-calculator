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
import { createYeastLayers, KEYS as YEAST_KEYS } from "../../frontend/src/adapters/cards/yeast.js";
import { createMashLayers, KEYS as MASH_KEYS } from "../../frontend/src/adapters/cards/mash.js";
import {
  createBrewDayLayers,
  KEYS as BREW_DAY_KEYS,
} from "../../frontend/src/adapters/cards/brew-day.js";
import { createWaterLayers, KEYS as WATER_KEYS } from "../../frontend/src/adapters/cards/water.js";
import { createStyleLayers } from "../../frontend/src/adapters/cards/style.js";
import { KEYS as STYLE_DECLARATION_KEYS } from "../../frontend/src/adapters/cards/style/declaration.js";
import { KEYS as STYLE_NAVIGATOR_KEYS } from "../../frontend/src/adapters/cards/style/navigator.js";
import { KEYS as STYLE_TARGETS_KEYS } from "../../frontend/src/adapters/cards/style/targets.js";
import { KEYS as STYLE_CONFORMANCE_KEYS } from "../../frontend/src/adapters/cards/style/conformance.js";
import {
  createHopStrategyLayers,
  KEYS as HOP_STRATEGY_KEYS,
} from "../../frontend/src/adapters/cards/hopsStrategy.js";

function context() {
  return {
    artifact: { nodes: {}, primitive_schemas: {}, taxonomies: {}, dimensions: {} },
    cache: { seeds: {}, references: {} },
    engine: { get: () => undefined, resolve: () => undefined, call: () => 0 },
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

const REMAINING_CASES = [
  ["yeast", createYeastLayers, YEAST_KEYS],
  ["mash", createMashLayers, MASH_KEYS],
  ["brewDay", createBrewDayLayers, BREW_DAY_KEYS],
  ["water", createWaterLayers, WATER_KEYS],
  ["hopStrategy", createHopStrategyLayers, HOP_STRATEGY_KEYS],
  [
    "style",
    createStyleLayers,
    [
      ...STYLE_DECLARATION_KEYS,
      ...STYLE_NAVIGATOR_KEYS,
      ...STYLE_TARGETS_KEYS,
      ...STYLE_CONFORMANCE_KEYS,
    ],
  ],
];

test("the remaining layer factories cover exactly the declared surface", () => {
  for (const [name, factory, keys] of REMAINING_CASES) {
    const layers = factory(context());

    assert.ok(Array.isArray(layers), `${name}: returns a layer list`);
    assert.ok(layers.length >= 1, `${name}: at least one layer`);
    assert.deepEqual(
      [...layerKeys(layers)].sort(),
      [...new Set(keys)].sort(),
      `${name}: layers cover the declared surface`
    );
  }
});

test("the hop factory also returns the cooling-curve picker", () => {
  const layers = createHopLayers(context());
  const keys = layerKeys(layers);

  assert.ok(keys.has("coolingCurveId"));
  assert.ok(keys.has("coolingCurveSummary"));
  assert.ok(keys.has("selectCoolingCurve"));
});
