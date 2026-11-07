import test from "node:test";
import assert from "node:assert/strict";

import {
  materializeSelections,
  migrateAttenuationDerate,
  migrateLegacyYeastCap,
  seedIdentityResiduals,
  seedSugarShareParts,
} from "../../frontend/src/store/batchMigrations.js";
import { EQUAL_SUGAR_PARTS } from "../../frontend/src/views/producer/sugarAllocation.js";

function engineWith({ values = {}, authored = {}, resolved = {} } = {}) {
  const writes = [];
  return {
    writes,
    get: (path) => values[path],
    getAuthored: (path) => authored[path] ?? [],
    resolve: (path) => resolved[path],
    setCollection: (path, rows) => writes.push({ path, rows }),
  };
}

function rootHandlers(initial = {}) {
  const roots = { ...initial };
  const writes = [];
  return {
    roots,
    writes,
    getRoot: (id) => roots[id],
    setRoot: (id, value) => {
      roots[id] = value;
      writes.push({ id, value });
    },
  };
}

test("sugar parts are seeded only for an authored share with zero weights", () => {
  const engine = engineWith({
    values: {
      "batch.late_addition_intent": "share",
      "batch.sugar_extract_share": 0.2,
    },
    authored: { "batch.sugars": [{ parts: 0 }, { parts: 0 }] },
  });

  assert.equal(seedSugarShareParts({ engine }), true);
  assert.deepEqual(engine.writes, [
    { path: "batch.sugars", rows: [{ parts: EQUAL_SUGAR_PARTS }, { parts: EQUAL_SUGAR_PARTS }] },
  ]);
});

test("sugar parts are left alone when the intent, share or weights already exist", () => {
  const noIntent = engineWith({
    values: { "batch.late_addition_intent": "dose", "batch.sugar_extract_share": 0.2 },
    authored: { "batch.sugars": [{ parts: 0 }] },
  });
  assert.equal(seedSugarShareParts({ engine: noIntent }), false);

  const noShare = engineWith({
    values: { "batch.late_addition_intent": "share", "batch.sugar_extract_share": 0 },
    authored: { "batch.sugars": [{ parts: 0 }] },
  });
  assert.equal(seedSugarShareParts({ engine: noShare }), false);

  const noRows = engineWith({
    values: { "batch.late_addition_intent": "share", "batch.sugar_extract_share": 0.2 },
  });
  assert.equal(seedSugarShareParts({ engine: noRows }), false);

  const weighed = engineWith({
    values: { "batch.late_addition_intent": "share", "batch.sugar_extract_share": 0.2 },
    authored: { "batch.sugars": [{ parts: 10 }] },
  });
  assert.equal(seedSugarShareParts({ engine: weighed }), false);
  assert.deepEqual(weighed.writes, []);
});

test("a legacy derate multiplier converts to points off the strain maximum", () => {
  const engine = engineWith({ resolved: { "batch.yeast.attenuation_cap_pct": 0.8 } });
  const roots = rootHandlers();

  assert.equal(migrateAttenuationDerate({ engine, ...roots }, 0.9), true);
  assert.ok(Math.abs(roots.roots["batch.attenuation_derate_points"] - 0.08) < 1e-9);
});

test("the derate conversion is clamped to the contract's 0-0.25 band", () => {
  const engine = engineWith({ resolved: { "batch.yeast.attenuation_cap_pct": 0.8 } });

  const above = rootHandlers();
  migrateAttenuationDerate({ engine, ...above }, -1);
  assert.equal(above.roots["batch.attenuation_derate_points"], 0.25);

  const below = rootHandlers();
  migrateAttenuationDerate({ engine, ...below }, 2);
  assert.equal(below.roots["batch.attenuation_derate_points"], 0);
});

test("a derate is not migrated twice or without a published attenuation", () => {
  const engine = engineWith({ resolved: { "batch.yeast.attenuation_cap_pct": 0.8 } });

  const existing = rootHandlers({ "batch.attenuation_derate_points": 0.05 });
  assert.equal(migrateAttenuationDerate({ engine, ...existing }, 0.9), false);
  assert.deepEqual(existing.writes, []);

  const noAa = rootHandlers();
  assert.equal(
    migrateAttenuationDerate({ engine: engineWith({ resolved: {} }), ...noAa }, 0.9),
    false
  );

  const notNumber = rootHandlers();
  assert.equal(migrateAttenuationDerate({ engine, ...notNumber }, "0.9"), false);
  assert.deepEqual(notNumber.writes, []);
});

test("a legacy yeast snapshot reads attenuation_pct as the cap", () => {
  const fixture = selectionFixture({
    snapshots: { "batch.yeast": { id: "y-1", attenuation_pct: 0.78 } },
  });

  assert.equal(migrateLegacyYeastCap({ session: fixture.session }), true);
  assert.deepEqual(fixture.selections, [
    {
      id: "batch.yeast",
      component: { id: "y-1", attenuation_pct: 0.78, attenuation_cap_pct: 0.78 },
    },
  ]);
});

test("the cap migration leaves a current snapshot and non-numeric values alone", () => {
  const current = selectionFixture({
    snapshots: { "batch.yeast": { id: "y-1", attenuation_cap_pct: 0.8 } },
  });
  assert.equal(migrateLegacyYeastCap({ session: current.session }), false);
  assert.deepEqual(current.selections, []);

  const notNumber = selectionFixture({
    snapshots: { "batch.yeast": { id: "y-1", attenuation_pct: "0.78" } },
  });
  assert.equal(migrateLegacyYeastCap({ session: notNumber.session }), false);
  assert.deepEqual(notNumber.selections, []);
});

test("identity residuals seed only the missing roots from a selection", () => {
  const roots = rootHandlers();

  const changed = seedIdentityResiduals({
    identity: { style: { name: "Czech Premium Pale Lager", tags: ["bottom-fermented"] } },
    ...roots,
  });

  assert.equal(changed, true);
  assert.equal(roots.roots["batch.fermentation"], "lager");
});

test("identity residuals leave an authored root alone", () => {
  const roots = rootHandlers({ "batch.fermentation": "mixed" });

  const changed = seedIdentityResiduals({
    identity: { style: { name: "Czech Premium Pale Lager", tags: ["bottom-fermented"] } },
    ...roots,
  });

  assert.equal(changed, false);
  assert.equal(roots.roots["batch.fermentation"], "mixed");
  assert.deepEqual(roots.writes, []);
});

test("empty identity components seed nothing", () => {
  const roots = rootHandlers();
  assert.equal(seedIdentityResiduals({ identity: { style: {} }, ...roots }), false);
  assert.equal(seedIdentityResiduals({ identity: {}, ...roots }), false);
  assert.equal(seedIdentityResiduals({ identity: undefined, ...roots }), false);
});

function selectionFixture({ snapshots = {}, cache = {}, engineGet = () => "y-1" } = {}) {
  const selections = [];
  return {
    selections,
    session: {
      selections: () => snapshots,
      setSelection: (id, component) => selections.push({ id, component }),
    },
    artifact: {
      nodes: {
        "batch.yeast": {
          kind: "selection",
          ref: "batch.yeast_id",
          output: { schema: "yeast" },
        },
      },
    },
    cache: { references: cache },
    engine: { get: engineGet },
  };
}

test("a referenced component is materialised into a missing snapshot", () => {
  const fixture = selectionFixture({ cache: { yeast: { "y-1": { id: "y-1", name: "House" } } } });

  assert.equal(materializeSelections(fixture), true);
  assert.deepEqual(fixture.selections, [
    { id: "batch.yeast", component: { id: "y-1", name: "House" } },
  ]);
});

test("materialising skips an existing snapshot, an empty ref and a missing component", () => {
  const existing = selectionFixture({
    snapshots: { "batch.yeast": { id: "y-1" } },
    cache: { yeast: { "y-1": { id: "y-1" } } },
  });
  assert.equal(materializeSelections(existing), false);
  assert.deepEqual(existing.selections, []);

  const emptyRef = selectionFixture({ cache: { yeast: { "y-1": { id: "y-1" } } }, engineGet: () => "" });
  assert.equal(materializeSelections(emptyRef), false);

  const noComponent = selectionFixture({ engineGet: () => "missing" });
  assert.equal(materializeSelections(noComponent), false);
});

test("a failing ref read is reported and skipped", () => {
  const reported = [];
  const fixture = selectionFixture({
    cache: { yeast: { "y-1": { id: "y-1" } } },
    engineGet: () => {
      throw new Error("unresolved ref");
    },
  });

  assert.equal(
    materializeSelections({ ...fixture, reportError: (scope, err) => reported.push({ scope, err }) }),
    false
  );
  assert.equal(reported.length, 1);
  assert.equal(reported[0].scope, "batchMigrations.materializeSelections");
});
