import test from "node:test";
import assert from "node:assert/strict";

import {
  buildBrewDayPayload,
  defaultBrewDayRows,
  materializeBrewDayRows,
  selectBrewDayLevel,
  selectBrewDayRow,
  selectBrewDaySections,
  updateBrewDayRow,
} from "../../frontend/src/views/brewDayLogic.js";

const PLAIN_ENGINE = {
  get: () => undefined,
  resolve: () => undefined,
};

test("defaultBrewDayRows builds every canonical checklist row empty", () => {
  const rows = defaultBrewDayRows();
  assert.equal(rows.length, 94);
  assert.deepEqual(rows[0], {
    step_id: "pre-safety-hot",
    note: "",
    skipped: false,
    skip_reason: "",
  });
  assert.deepEqual(rows.at(-1), {
    step_id: "review-update",
    note: "",
    skipped: false,
    skip_reason: "",
  });
  assert.ok(rows.every((row) => row.note === "" && row.skipped === false));
});

test("materializeBrewDayRows overlays persisted notes in canonical order", () => {
  const rows = materializeBrewDayRows([
    { step_id: "batch-sparge", instructions: "Sparge slowly" },
    { step_id: "advance-prep", note: "Prep", skipped: true, skip_reason: "Bought pre-milled" },
  ]);
  assert.equal(rows.length, 94);
  assert.deepEqual(rows.find((row) => row.step_id === "batch-sparge"), {
    step_id: "batch-sparge",
    note: "Sparge slowly",
    skipped: false,
    skip_reason: "",
  });
  assert.deepEqual(rows.find((row) => row.step_id === "advance-prep"), {
    step_id: "advance-prep",
    note: "Prep",
    skipped: true,
    skip_reason: "Bought pre-milled",
  });
});

test("buildBrewDayPayload wraps the phases without copying or mutating them", () => {
  const phases = [{ id: "pre" }, { id: "brew" }];
  const payload = buildBrewDayPayload(phases);
  assert.equal(payload.process, "single_batch_batch_sparge");
  assert.equal(payload.phases, phases);
  assert.deepEqual(phases, [{ id: "pre" }, { id: "brew" }]);
});

test("selectBrewDayRow returns the matching row or null", () => {
  const rows = [
    { step_id: "a", note: "x" },
    { step_id: "b", note: "y" },
  ];
  assert.deepEqual(selectBrewDayRow(rows, "b"), { step_id: "b", note: "y" });
  assert.equal(selectBrewDayRow(rows, "missing"), null);
  assert.equal(selectBrewDayRow(null, "a"), null);
});

test("updateBrewDayRow patches one row and leaves the source untouched", () => {
  const rows = [
    { step_id: "a", note: "x" },
    { step_id: "b", note: "y" },
  ];
  const updated = updateBrewDayRow(rows, "a", { note: "z" });
  assert.deepEqual(updated, [
    { step_id: "a", note: "z" },
    { step_id: "b", note: "y" },
  ]);
  assert.deepEqual(rows, [
    { step_id: "a", note: "x" },
    { step_id: "b", note: "y" },
  ]);
  assert.notEqual(updated, rows);
});

test("selectBrewDayLevel defaults to info and preserves explicit levels", () => {
  assert.equal(selectBrewDayLevel(), "info");
  assert.equal(selectBrewDayLevel({ level: "debug" }), "debug");
  assert.equal(selectBrewDayLevel({ level: "critical" }), "critical");
});

test("selectBrewDaySections groups plain rows through a plain engine object", () => {
  const phases = selectBrewDaySections({
    artifact: { dimensions: {} },
    engine: PLAIN_ENGINE,
    unitMode: {},
    level: "info",
    stateRows: [],
    catalog: { nodes: {} },
  });
  assert.deepEqual(
    phases.map((phase) => ({
      id: phase.id,
      sections: phase.sections.map((section) => ({
        id: section.id,
        count: section.count,
        rows: section.rows.length,
      })),
    })),
    [
      {
        id: "pre",
        sections: [
          { id: "safety", count: 5, rows: 5 },
          { id: "plan", count: 7, rows: 7 },
          { id: "procure", count: 6, rows: 6 },
          { id: "equipment", count: 4, rows: 4 },
          { id: "preflight", count: 5, rows: 5 },
        ],
      },
      {
        id: "brew",
        sections: [
          { id: "setup", count: 3, rows: 3 },
          { id: "mash", count: 4, rows: 4 },
          { id: "lauter", count: 6, rows: 6 },
          { id: "boil", count: 4, rows: 4 },
          { id: "knockout", count: 6, rows: 6 },
          { id: "closeout", count: 3, rows: 3 },
        ],
      },
      {
        id: "post",
        sections: [
          { id: "fermentation", count: 4, rows: 4 },
          { id: "packaging", count: 6, rows: 6 },
          { id: "review", count: 3, rows: 3 },
        ],
      },
      {
        id: "observations",
        sections: [{ id: "observations", count: 0, rows: 12 }],
      },
    ]
  );
});
