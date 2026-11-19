// The one-pool mode authors mass proportions across the whole hot side, so the
// two hop tables normalize together: a share typed in the boil table moves the
// whirlpool rows too. The two-pool mode's `parts` are untouched by this.

import test from "node:test";
import assert from "node:assert/strict";

import { normalizedMassShares } from "../../frontend/src/views/producer/authoring.js";
import { massShareLabel } from "../../frontend/src/adapters/cards/hopAllocation.js";

const close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

test("mass shares normalize across both hop tables", () => {
  const { boil, whirlpool } = normalizedMassShares(
    [{ mass_parts: 37 }, { mass_parts: 28 }],
    [{ mass_parts: 15 }, { mass_parts: 20 }]
  );
  const shares = [...boil, ...whirlpool].map((row) => row.mass_pct);
  assert.ok(close(shares.reduce((sum, value) => sum + value, 0), 1));
  assert.equal(shares.length, 4);
  assert.ok(boil[0].mass_pct > boil[1].mass_pct);
  assert.ok(close(boil[0].mass_pct, 37 / 100));
});

test("a row with no share weighs nothing and is not guessed at", () => {
  const { boil } = normalizedMassShares([{ mass_parts: 10 }, { mass_parts: null }], []);
  assert.equal(boil[1].mass_pct, 0);
  assert.equal(boil[0].mass_pct, 1);
});

test("every share zero is every share zero, not a division by zero", () => {
  const { boil, whirlpool } = normalizedMassShares([{ mass_parts: 0 }], [{ mass_parts: 0 }]);
  assert.deepEqual(
    [...boil, ...whirlpool].map((row) => row.mass_pct),
    [0, 0]
  );
});

test("the share label reads a fraction as a percentage and absence as a dash", () => {
  assert.equal(massShareLabel({ mass_pct: 0.247 }), "24.7%");
  assert.equal(massShareLabel({ mass_pct: null }), "—");
  assert.equal(massShareLabel({}), "—");
});

test("normalizing leaves the other authored columns alone", () => {
  const { boil } = normalizedMassShares(
    [{ hop_id: "citra", parts: 10, mass_parts: 2, mass_pct: 0.9 }],
    []
  );
  assert.equal(boil[0].parts, 10);
  assert.equal(boil[0].hop_id, "citra");
  assert.equal(boil[0].mass_pct, 1);
});
