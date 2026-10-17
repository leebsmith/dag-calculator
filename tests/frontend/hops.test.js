import test from "node:test";
import assert from "node:assert/strict";

import {
  tinsethUtilization,
  ibuFromMass,
  massFromIbu,
} from "../../frontend/src/views/hops.js";

const KG_PER_OZ = 0.028349523125;
const L_PER_GAL = 3.785411784;

test("tinseth utilization matches a reference vector", () => {
  const u = tinsethUtilization(1.05, 60);
  assert.ok(Math.abs(u - 0.2306640772510991) < 1e-12, `U=${u}`);
});

test("one ounce of 6.5% AA in one gallon at 60 min ~ 112 IBU", () => {
  const ibu = ibuFromMass(KG_PER_OZ, 0.065, 60, 1.05, L_PER_GAL);
  assert.ok(Math.abs(ibu - 112.28381284467628) < 1e-9, `IBU=${ibu}`);
});

test("massFromIbu inverts ibuFromMass", () => {
  const mass = 0.028;
  const ibu = ibuFromMass(mass, 0.065, 60, 1.05, 19);
  const back = massFromIbu(ibu, 0.065, 60, 1.05, 19);
  assert.ok(Math.abs(back - mass) < 1e-12);
});

test("utilization is zero at t=0, monotonic, and approaches its asymptote", () => {
  assert.equal(tinsethUtilization(1.05, 0), 0);
  assert.ok(tinsethUtilization(1.05, 30) < tinsethUtilization(1.05, 60));
  const bigness = 1.65 * Math.pow(0.000125, 0.05);
  assert.ok(Math.abs(tinsethUtilization(1.05, 600) - bigness / 4.15) < 1e-6);
});

test("guards invalid inputs", () => {
  assert.equal(ibuFromMass(0.028, 0, 60, 1.05, 19), null);
  assert.equal(ibuFromMass(0.028, 0.065, 60, 0, 19), null);
  assert.equal(massFromIbu(0, 0.065, 60, 1.05, 19), null);
  assert.equal(massFromIbu(20, 0.065, 60, 1.05, 0), null);
});
