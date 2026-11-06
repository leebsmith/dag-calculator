import test from "node:test";
import assert from "node:assert/strict";

import { assertNoCollisions, BASE_KEYS, installerSurfaceGaps } from "../../frontend/src/adapters/contract.js";
import { INSTALLERS } from "../../frontend/src/adapters/installers.js";
import { createStepApp } from "../../frontend/src/adapters/stepAdapter.js";
import { createCatalogRegistry } from "../../frontend/src/adapters/cards/catalogChrome.js";
import { createYeastLayers, KEYS as YEAST_KEYS } from "../../frontend/src/adapters/cards/yeast.js";
import { createMashLayers, KEYS as MASH_KEYS } from "../../frontend/src/adapters/cards/mash.js";
import { createBrewDayLayers, KEYS as BREW_DAY_KEYS } from "../../frontend/src/adapters/cards/brew-day.js";
import { createWaterLayers, KEYS as WATER_KEYS } from "../../frontend/src/adapters/cards/water.js";
import {
  createHopStrategyLayers,
  KEYS as HOP_STRATEGY_KEYS,
} from "../../frontend/src/adapters/cards/hopsStrategy.js";
import { createStyleLayers } from "../../frontend/src/adapters/cards/style.js";
import { KEYS as STYLE_DECLARATION_KEYS } from "../../frontend/src/adapters/cards/style/declaration.js";
import { KEYS as STYLE_NAVIGATOR_KEYS } from "../../frontend/src/adapters/cards/style/navigator.js";
import { KEYS as STYLE_TARGETS_KEYS } from "../../frontend/src/adapters/cards/style/targets.js";
import { KEYS as STYLE_CONFORMANCE_KEYS } from "../../frontend/src/adapters/cards/style/conformance.js";
import { createHopLayers } from "../../frontend/src/adapters/cards/hops.js";

test("every installer declares a non-empty key set", () => {
  for (const { name, keys } of INSTALLERS) {
    assert.ok(Array.isArray(keys) && keys.length > 0, `${name} KEYS is empty`);
  }
});

test("no two installers assign the same app member", () => {
  assertNoCollisions(INSTALLERS);
});

test("assertNoCollisions catches a synthetic collision", () => {
  assert.throws(() =>
    assertNoCollisions([
      { name: "a", keys: ["x", "y"] },
      { name: "b", keys: ["y"] },
    ])
  );
});

test("the assembled app matches the declared installer surface exactly", () => {
  const app = createStepApp();
  assert.deepEqual(installerSurfaceGaps(app, INSTALLERS), { undeclared: [], missing: [] });
});

test("installerSurfaceGaps reports both drift directions", () => {
  const app = { common: 1, declared: 1, strayed: 1 };
  Object.defineProperty(app, BASE_KEYS, { value: ["common"], enumerable: false });
  const gaps = installerSurfaceGaps(app, [{ name: "a", keys: ["declared", "absent"] }]);
  assert.deepEqual(gaps.undeclared, ["strayed"]);
  assert.deepEqual(gaps.missing, ["absent"]);
});

test("installerSurfaceGaps sees a hidden member", () => {
  const app = { common: 1, visible: 1 };
  Object.defineProperty(app, BASE_KEYS, { value: ["common"], enumerable: false });
  Object.defineProperty(app, "hiddenGetter", { get: () => 1, enumerable: false });
  const gaps = installerSurfaceGaps(app, [{ name: "a", keys: ["visible"] }]);
  assert.deepEqual(gaps.undeclared, ["hiddenGetter"]);
});

test("the assembled app has hidden members, and the check covers them", () => {
  const app = createStepApp();
  const hidden = Object.getOwnPropertyNames(app).filter((key) => !Object.keys(app).includes(key));
  assert.ok(hidden.length > 0, "expected non-enumerable app members");
});

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
