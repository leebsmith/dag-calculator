import test from "node:test";
import assert from "node:assert/strict";

import {
  convertWhirlpoolHopRows,
  filterDoughInRests,
} from "../../frontend/src/utils/migrationTransformers.js";

test("filterDoughInRests drops only the retired dough-in row", () => {
  const rows = [
    { rest_id: "dough_in", duration_min: 0 },
    { rest_id: "beta_alpha_amylase", duration_min: 60 },
  ];
  const result = filterDoughInRests(rows);

  assert.equal(result.changed, true);
  assert.deepEqual(result.rows, [{ rest_id: "beta_alpha_amylase", duration_min: 60 }]);
  assert.equal(rows.length, 2, "the source rows stay untouched");
});

test("filterDoughInRests reports no change when there is nothing to drop", () => {
  const rows = [{ rest_id: "beta_alpha_amylase", duration_min: 60 }];
  assert.deepEqual(filterDoughInRests(rows), { rows, changed: false });
  assert.deepEqual(filterDoughInRests(null), { rows: null, changed: false });
});

test("convertWhirlpoolHopRows derives knockout-relative coordinates", () => {
  const rows = [
    { duration_min: 60, initial_temp_c: 99 },
    { duration_min: 20, initial_temp_c: 80 },
  ];
  const result = convertWhirlpoolHopRows(rows);

  assert.equal(result.changed, true);
  assert.equal(result.knockout, 60);
  assert.deepEqual(result.rows, [
    { addition_at_min: 0, initial_temp_c: 99 },
    { addition_at_min: 40, initial_temp_c: 80 },
  ]);
  assert.equal(rows[0].duration_min, 60, "the source rows stay untouched");
});

test("convertWhirlpoolHopRows leaves converted, empty, and missing collections alone", () => {
  const converted = [{ addition_at_min: 10, initial_temp_c: 90 }];
  assert.deepEqual(convertWhirlpoolHopRows(converted), {
    rows: converted,
    changed: false,
    knockout: 0,
  });
  assert.deepEqual(convertWhirlpoolHopRows([]), { rows: [], changed: false, knockout: 0 });
  assert.deepEqual(convertWhirlpoolHopRows(null), {
    rows: null,
    changed: false,
    knockout: 0,
  });
});
