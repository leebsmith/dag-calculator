import test from "node:test";
import assert from "node:assert/strict";

import {
  fieldInputKey,
  normalizedRowShares,
  rowDefaults,
} from "../../frontend/src/views/producer/authoring.js";

test("input keys compose the prefix and every part with colons", () => {
  assert.equal(fieldInputKey("field", "batch.boil_time_min"), "field:batch.boil_time_min");
  assert.equal(fieldInputKey("cell", "grist.major_malts", 0, "parts"), "cell:grist.major_malts:0:parts");
  assert.equal(fieldInputKey("ion", "water.pinned_ions.calcium"), "ion:water.pinned_ions.calcium");
  assert.equal(fieldInputKey("field"), "field");
});

test("normalized row shares hamilton-normalize parts into pct", () => {
  const rows = [
    { parts: 3, pct: 0 },
    { parts: 1, pct: 0 },
  ];
  const out = normalizedRowShares(rows);
  assert.deepEqual(
    out.map((row) => row.pct),
    [0.75, 0.25]
  );
  assert.equal(out[0] === rows[0], false, "rows are copied, not mutated");
  assert.equal(rows[0].pct, 0);
  assert.equal(out[0].parts, 3);
});

test("normalized row shares sum to exactly one at 0.1% resolution", () => {
  const out = normalizedRowShares([{ parts: 1 }, { parts: 1 }, { parts: 1 }]);
  const total = out.reduce((sum, row) => sum + row.pct, 0);
  assert.equal(Math.round(total * 1000) / 1000, 1);
});

test("normalized row shares keep an empty collection and zero the empty weight", () => {
  assert.deepEqual(normalizedRowShares([]), []);
  const zeroed = normalizedRowShares([{ parts: 0 }, { parts: -2 }]);
  assert.deepEqual(
    zeroed.map((row) => row.pct),
    [0, 0]
  );
});

test("row defaults follow the schema: default, boolean, taxonomy, dimension, text", () => {
  const schema = {
    name: { type: "string" },
    enabled: { type: "boolean" },
    use: { taxonomy: "hop_use" },
    unknown_use: { taxonomy: "absent_taxonomy" },
    mass_kg: { dimension: "mass" },
    note: { type: "string", default: "n/a" },
  };
  assert.deepEqual(rowDefaults(schema, { hop_use: ["boil", "whirlpool"] }), {
    name: "",
    enabled: false,
    use: "boil",
    unknown_use: "",
    mass_kg: 0,
    note: "n/a",
  });
});

test("row defaults tolerate a missing schema", () => {
  assert.deepEqual(rowDefaults({}), {});
});
