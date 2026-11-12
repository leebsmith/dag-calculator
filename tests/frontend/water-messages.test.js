// The water vocabulary guard: every status, hint, notice and line the card can
// show comes from `waterMessages.js`. A new string must be declared there, so
// copy cannot drift between the grid, the plan field and the warning badge.

import test from "node:test";
import assert from "node:assert/strict";

import {
  WATER_HINTS,
  WATER_STATUS,
  floorNotice,
  phLine,
  phStatusLabel,
  routeLine,
  rowState,
  statusFor,
  targetWarning,
} from "../../frontend/src/views/waterMessages.js";

const STATUSES = new Set(Object.values(WATER_STATUS));
const HINTS = new Set(["", ...Object.values(WATER_HINTS)]);

test("row states use the declared vocabulary", () => {
  const states = [
    rowState({ isChecked: false, isValued: false, below: false, drifted: false, phCorrected: true, pin: "alk", route: "CALCIUM_FLOOR" }),
    rowState({ isChecked: true, isValued: false, below: false, drifted: false, phCorrected: false, pin: "ca", route: "CUSTOM" }),
    rowState({ isChecked: true, isValued: true, below: true, drifted: false, phCorrected: false, pin: "so4", route: "CALCIUM_FLOOR" }),
    rowState({ isChecked: true, isValued: true, below: false, drifted: true, phCorrected: true, pin: "alk", route: "CUSTOM" }),
    rowState({ isChecked: true, isValued: true, below: false, drifted: false, phCorrected: false, pin: "alk", route: "HYBRID" }),
    rowState({ isChecked: true, isValued: true, below: false, drifted: false, phCorrected: false, pin: "ca", route: "OPTIMIZE" }),
  ];
  for (const state of states) {
    assert.ok(STATUSES.has(state.status), state.status);
    assert.ok(HINTS.has(state.hint), state.hint);
  }
});

test("statuses name the constraint, not the algorithm", () => {
  assert.equal(statusFor("HYBRID", "alk"), WATER_STATUS.heldMin);
  assert.equal(statusFor("OPTIMIZE", "ca"), WATER_STATUS.bestFit);
  assert.equal(statusFor("CUSTOM", "ca", true), WATER_STATUS.preCorrection);
  assert.equal(statusFor("CUSTOM", "ca"), WATER_STATUS.held);
});

test("the route line and warning speak objectives", () => {
  assert.match(routeLine([]), /^No objectives/);
  assert.match(routeLine(["so4", "cl"]), /^Objectives: SO₄\/Cl \(2\) — exact/);
  assert.match(targetWarning(["ca", "mg", "na", "so4", "cl"]), /5 objectives/);
  assert.equal(targetWarning(["ca"]), "");
});

test("the pH line names the correction or says none", () => {
  const acid = [{ key: "acid_l", label: "88% lactic acid", text: "1.4 mL" }];
  assert.equal(phLine(5.91, 5.4, acid, []), "5.91 → 5.40 · grist 88% lactic acid 1.4 mL");
  assert.equal(phLine(5.4, 5.4, [], []), "5.40 → 5.40 · no correction");
});

test("the pH status uses its declared option label", () => {
  assert.equal(
    phStatusLabel({ value: "HIGH", display: "HIGH", optionLabels: { HIGH: "High" } }),
    "High"
  );
  assert.equal(phStatusLabel(null), "");
});

test("the floor notice states the state it is in", () => {
  assert.match(floorNotice(0, false, 50, 0), /no ion objectives/);
  assert.match(floorNotice(1, true, 50, 60), /Not used while calcium/);
  assert.match(floorNotice(1, true, 200, 60), /objective wins/);
  assert.equal(floorNotice(2, false, 50, 0), "");
});
