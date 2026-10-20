import test from "node:test";
import assert from "node:assert/strict";

import { styleConformance } from "../../frontend/src/engine/styleConformance.js";

const FULL_ENVELOPE = {
  ogMin: 1.056,
  ogMax: 1.07,
  fgMin: 1.008,
  fgMax: 1.014,
  abvMin: 5.5,
  abvMax: 7.5,
  ibuMin: 40,
  ibuMax: 70,
  srmMin: 6,
  srmMax: 14,
};

test("an in-spec recipe yields SAI 100 and all dimensions within spec", () => {
  const report = styleConformance(
    { og: 1.063, fg: 1.011, abv: 6.9, ibu: 55, srm: 10 },
    FULL_ENVELOPE
  );
  assert.equal(report.hasBaseline, true);
  assert.equal(report.sai, 100);
  for (const dim of Object.values(report.dimensions)) {
    assert.equal(dim.status, "within");
  }
  assert.equal(report.dimensions.bugu.value > 0, true);
});

test("an empty envelope produces no baseline and a null SAI", () => {
  const report = styleConformance(
    { og: 1.063, fg: 1.011, abv: 6.9, ibu: 55, srm: 10 },
    { ogMin: 0, ogMax: 0, fgMin: 0, fgMax: 0, abvMin: 0, abvMax: 0, ibuMin: 0, ibuMax: 0, srmMin: 0, srmMax: 0 }
  );
  assert.equal(report.hasBaseline, false);
  assert.equal(report.sai, null);
});

test("per-dimension gating checks only complete envelopes", () => {
  const report = styleConformance(
    { og: 1.090, fg: 1.011, abv: 8.5, ibu: 55, srm: 10 },
    { ...FULL_ENVELOPE, fgMin: 0, fgMax: 0, ibuMin: 0, ibuMax: 0, srmMin: 0, srmMax: 0 }
  );
  assert.equal(report.dimensions.og.status, "severe");
  assert.equal(report.dimensions.abv.status, "severe");
  assert.equal(report.dimensions.fg, null);
  assert.equal(report.dimensions.ibu, null);
  assert.equal(report.dimensions.srm, null);
  assert.equal(report.dimensions.aa, null);
  assert.equal(report.dimensions.bugu, null);
});

test("an out-of-range OG reduces the SAI", () => {
  const report = styleConformance(
    { og: 1.090, fg: 1.011, abv: 6.9, ibu: 55, srm: 10 },
    FULL_ENVELOPE
  );
  assert.ok(report.sai < 100);
  assert.equal(report.dimensions.og.status, "severe");
});

test("a small excess falls in the grace zone (<= 1 JND)", () => {
  const report = styleConformance(
    { og: 1.071, fg: 1.011, abv: 6.9, ibu: 55, srm: 10 },
    FULL_ENVELOPE
  );
  // 1.071 is 0.001 over ogMax=1.070; tau_og=0.002 => z=0.5
  assert.equal(report.dimensions.og.status, "grace");
});

test("AA is bounded by the feasible region and reported in percentage points", () => {
  const report = styleConformance(
    { og: 1.063, fg: 1.011, abv: 6.9, ibu: 55, srm: 10 },
    FULL_ENVELOPE
  );
  const aa = report.dimensions.aa;
  assert.ok(aa.low > 0 && aa.low < aa.high && aa.high < 100);
  assert.equal(aa.status, "within");
});

test("BU:GU bounds are the exact IBUxOG rectangle ratio extrema", () => {
  const report = styleConformance(
    { og: 1.063, fg: 1.011, abv: 6.9, ibu: 55, srm: 10 },
    FULL_ENVELOPE
  );
  const bugu = report.dimensions.bugu;
  assert.ok(Math.abs(bugu.low - 40 / (1000 * (1.07 - 1))) < 1e-9);
  assert.ok(Math.abs(bugu.high - 70 / (1000 * (1.056 - 1))) < 1e-9);
});
