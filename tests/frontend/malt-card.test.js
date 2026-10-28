import test from "node:test";
import assert from "node:assert/strict";

import { refreshMaltCard, registerMaltCard, sortGristRows } from "../../frontend/src/adapters/cards/malt.js";
import { FERMENTABLE_NODES as N } from "../../frontend/src/views/registry/fermentables.js";
import { artifact as artifactFixture } from "../guards/util.js";

function setup() {
  const app = {
    draftRows: [],
    draftOpen: false,
    draftNodeId: null,
    catalogRevision: 0,
    fieldsBySlice: {
      [N.slice]: [
        { id: N.weightedLovibond, label: "Color" },
        { id: N.weightedYield, label: "Yield" },
      ],
    },
    addDraftRow(row) {
      this.draftRows.push(row);
    },
    inspectMaltRow(index) {
      this.maltActiveIndex = index;
      this.maltDrawer = "inspect";
    },
  };
  registerMaltCard(app, { cache: { seeds: { malts: {} } } });
  return app;
}

test("sortGristRows orders by parts then name, case-insensitively", () => {
  const rows = [
    { name: "b", parts: 10 },
    { name: "A", parts: 30 },
    { name: "a", parts: 10 },
    { name: "c" },
  ];

  assert.deepEqual(sortGristRows(rows).map((row) => row.name), ["A", "a", "b", "c"]);
  assert.deepEqual(rows.map((row) => row.name), ["b", "A", "a", "c"]);
});

test("maltIsTrace marks rows under two percent", () => {
  const app = setup();

  assert.equal(app.maltIsTrace({ pct: 0.019 }), true);
  assert.equal(app.maltIsTrace({ pct: 0.02 }), false);
  assert.equal(app.maltIsTrace({}), true);
});

test("cloneDraftMalt copies the inspected row as an unnamed custom malt", () => {
  const app = setup();
  app.draftRows = [{ catalog_id: "pils", name: "Pilsner", parts: 80 }];

  app.cloneDraftMalt(0);

  assert.deepEqual(app.draftRows[1], {
    catalog_id: null,
    name: "Pilsner (Custom)",
    parts: 80,
  });
  assert.equal(app.maltActiveIndex, 1);
  assert.equal(app.maltDrawer, "inspect");
});

test("cloneDraftMalt refuses at the row limit and for a missing row", () => {
  const app = setup();
  app.draftRows = Array.from({ length: 8 }, (_, i) => ({ catalog_id: `m${i}`, name: `M${i}`, parts: 1 }));

  app.cloneDraftMalt(0);

  assert.equal(app.draftRows.length, 8);
  assert.equal(app.maltAtLimit, true);

  app.draftRows = [];
  app.cloneDraftMalt(0);
  assert.deepEqual(app.draftRows, []);
});

test("malt totals and weighted field lookups track the draft rows", () => {
  const app = setup();
  app.draftRows = [
    { parts: 80, pct: 0.8 },
    { parts: "20", pct: 0.2 },
    { parts: "x", pct: 0 },
  ];

  assert.equal(app.maltTotalParts, 100);
  assert.equal(app.maltTotalPct, 1);
  assert.equal(app.maltWeightedColor.id, N.weightedLovibond);
  assert.equal(app.maltWeightedYield.id, N.weightedYield);
});

test("maltValidation reports balanced, deficit, surplus, and unconfigured", () => {
  const app = setup();

  assert.deepEqual(app.maltValidation, { type: "unconfigured", label: "Unconfigured", class: "badge-muted" });

  app.draftRows = [{ pct: 0.6 }];
  assert.deepEqual(app.maltValidation, { type: "deficit", label: "60.0% (Remaining 40.0%)", class: "badge-amber" });

  app.draftRows = [{ pct: 1 }];
  assert.deepEqual(app.maltValidation, { type: "balanced", label: "100.0% Balanced", class: "badge-success" });

  app.draftRows = [{ pct: 0.8 }, { pct: 0.3 }];
  assert.deepEqual(app.maltValidation, { type: "surplus", label: "110.0% (Excess +10.0%)", class: "badge-danger" });
});

test("refreshMaltCard sorts the engine grist rows onto the summary card", () => {
  const app = setup();
  const engine = {
    get: (id) => (id === N.majorMalts ? [{ name: "Crystal", parts: 20 }, { name: "Pils", parts: 80 }] : []),
  };

  refreshMaltCard(app, { engine, artifact: artifactFixture(), ui: {} });

  assert.deepEqual(app.gristRows.map((row) => row.name), ["Pils", "Crystal"]);
});
