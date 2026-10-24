import test from "node:test";
import assert from "node:assert/strict";

import {
  GAMMA_METRIC,
  cutaiaAbv,
  extractMassKg,
  oeForAbvAtAe,
  sugarAdvisory,
  sgToPlato,
} from "../../frontend/src/engine/fermentation.js";

const VOLUME = 20;

// Forward extract model mirroring the solver: fixed cold volume, malt and
// sucrose extract masses, extract-weighted AA, yeast cap.
function solveState({ malt, maltF = 0.81, sugar = 0, cap = 0.99 }) {
  const extract = malt + sugar;
  const oe = sgToPlato(1 + (extract * GAMMA_METRIC) / (1000 * VOLUME));
  const aaWort = (malt * maltF + sugar) / extract;
  const aa = Math.min(aaWort, cap);
  const ae = oe * (1 - aa);
  return {
    oe,
    ae,
    aa,
    abv: cutaiaAbv(oe, ae),
    aaWort,
    volumeL: VOLUME,
    yeastCap: cap,
    malt,
    maltF,
    sugar,
  };
}

function addSucrose(state, kg) {
  return solveState({
    malt: state.malt,
    maltF: state.maltF,
    sugar: state.sugar + kg,
    cap: state.yeastCap,
  });
}

const CRYSTAL_F = 0.9 * 0.81 + 0.1 * 0.5;

const RECIPES = [
  { name: "100% base, no sugar", state: solveState({ malt: 2.6 }) },
  { name: "90% base + 10% crystal", state: solveState({ malt: 2.6, maltF: CRYSTAL_F }) },
  { name: "80% base + 20% sucrose", state: solveState({ malt: 2.2, sugar: 0.55 }) },
  { name: "70% base + 30% sucrose", state: solveState({ malt: 2.0, sugar: 0.857 }) },
  {
    name: "base + crystal + sucrose",
    state: solveState({ malt: 2.2, maltF: CRYSTAL_F, sugar: 0.4 }),
  },
  { name: "high-gravity Belgian + 20% sugar", state: solveState({ malt: 3.2, sugar: 0.8 }) },
  { name: "session + 5% sugar", state: solveState({ malt: 1.5, sugar: 0.08 }) },
];

function advisory(state, target) {
  return sugarAdvisory({
    oe: state.oe,
    ae: state.ae,
    yeastCap: state.yeastCap,
    volumeL: state.volumeL,
    ...target,
  });
}

test("extract mass is the inverse of the solver's SG relation", () => {
  const oe = 12.5;
  const kg = extractMassKg(oe, VOLUME);
  assert.ok(Math.abs(sgToPlato(1 + (kg * GAMMA_METRIC) / (1000 * VOLUME)) - oe) < 1e-3);
});

test("fixed-AE ABV inversion picks the physical root", () => {
  const ae = 3.2;
  const target = cutaiaAbv(14, ae) + 0.5;
  const oe = oeForAbvAtAe(ae, target);
  assert.ok(oe > 14);
  assert.ok(Math.abs(cutaiaAbv(oe, ae) - target) < 1e-9);
});

for (const { name, state } of RECIPES) {
  test(`${name}: AA advisory holds AE and raises OE`, () => {
    for (const delta of [0, 0.02, 0.05]) {
      const targetAa = state.aa + delta;
      const a = advisory(state, { targetAa });
      assert.equal(a.ok, true, a.reason);
      assert.ok(a.sucroseKg >= 0);
      assert.ok(Math.abs(a.targetAa - targetAa) < 1e-9);
      assert.ok(Math.abs(a.ae - state.ae) < 1e-9);
      assert.ok(a.targetOe >= state.oe - 1e-12);
      if (delta === 0) assert.ok(a.sucroseKg < 1e-9);

      const after = addSucrose(state, a.sucroseKg);
      assert.ok(Math.abs(after.oe - a.targetOe) < 0.01);
      assert.ok(Math.abs(after.ae - state.ae) < 0.2, `${name}: AE drift`);
      assert.ok(Math.abs(after.aa - targetAa) < 0.005, `${name}: AA miss`);
      assert.ok(Math.abs(after.abv - a.targetAbv) < 0.05, `${name}: ABV miss`);
    }
  });

  test(`${name}: ABV advisory agrees with the AA ray`, () => {
    for (const delta of [0, 0.5, 1.0]) {
      const targetAbv = state.abv + delta;
      const a = advisory(state, { targetAbv });
      assert.equal(a.ok, true, a.reason);
      assert.ok(a.sucroseKg >= 0);
      assert.ok(Math.abs(a.targetAbv - targetAbv) < 1e-6);
      assert.ok(Math.abs(a.ae - state.ae) < 1e-9);
      if (delta === 0) assert.ok(a.sucroseKg < 1e-9);

      const aaTarget = advisory(state, { targetAa: a.targetAa });
      assert.ok(aaTarget.ok);
      assert.ok(Math.abs(aaTarget.targetOe - a.targetOe) < 1e-6);

      const after = addSucrose(state, a.sucroseKg);
      assert.ok(Math.abs(after.abv - targetAbv) < 0.05);
      assert.ok(Math.abs(after.ae - state.ae) < 0.2);
    }
  });

  test(`${name}: infeasible directions are reported`, () => {
    assert.equal(advisory(state, { targetAa: state.aa - 0.01 }).reason, "below_current_aa");
    assert.equal(
      advisory(state, { targetAa: state.yeastCap + 0.002 }).reason,
      "above_yeast_cap"
    );
    assert.equal(advisory(state, { targetAa: 1.01 }).reason, "impossible_aa");
    assert.equal(advisory(state, { targetAbv: state.abv - 0.1 }).reason, "below_current_abv");
    assert.equal(advisory(state, {}).reason, "no_target");
  });
}

test("the advisory never mutates its inputs", () => {
  const state = RECIPES[2].state;
  const before = { ...state };
  const input = { oe: state.oe, ae: state.ae, yeastCap: state.yeastCap, volumeL: VOLUME };
  const frozen = Object.freeze({ ...input });
  sugarAdvisory({ ...frozen, targetAa: state.aa + 0.02 });
  assert.deepEqual(state, before);
  assert.deepEqual(input, frozen);
});

test("a zero delta is a zero dose at every recipe point", () => {
  for (const { state } of RECIPES) {
    const a = advisory(state, { targetAa: state.aa });
    assert.ok(a.ok);
    assert.ok(a.sucroseKg < 1e-9);
  }
});

test("seeded sweep: feasible AA targets always land", () => {
  let seed = 123456789;
  const rand = () => {
    seed = (1103515245 * seed + 12345) % 2147483648;
    return seed / 2147483648;
  };
  for (let i = 0; i < 200; i += 1) {
    const malt = 0.9 + rand() * 1.9;
    const sugar = rand() * 0.8;
    const cap = 0.85 + rand() * 0.14;
    const state = solveState({ malt, sugar, cap, maltF: 0.72 + rand() * 0.1 });
    const targetAa = state.aa + rand() * Math.min(0.06, cap - state.aa) * 0.99;
    const a = advisory(state, { targetAa });
    assert.equal(a.ok, true, a.reason);
    assert.ok(a.sucroseKg >= 0);
    assert.ok(Math.abs(a.targetAa - targetAa) < 1e-9);
    const after = addSucrose(state, a.sucroseKg);
    assert.ok(Math.abs(after.aa - targetAa) < 0.02);
    assert.ok(Math.abs(after.ae - state.ae) < 0.2);
  }
});
