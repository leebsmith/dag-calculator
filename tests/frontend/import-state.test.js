import test from "node:test";
import assert from "node:assert/strict";

import {
  GATE,
  ROW,
  gateState,
  rowState,
  sectionState,
} from "../../frontend/src/views/import/state.js";

const row = (extra = {}) => ({
  line_id: "l1",
  section: "fermentables",
  name: "Maris Otter",
  decision: "unresolved",
  ref: null,
  ...extra,
});

test("a row is one of five states, and only two block", () => {
  assert.equal(rowState(row()).state, ROW.OPEN);
  assert.equal(rowState(row()).blocks, true);

  assert.equal(rowState(row({ decision: "mapped", ref: "m1" })).state, ROW.PICKED);
  assert.equal(rowState(row({ decision: "mapped", ref: "m1" })).blocks, false);

  assert.equal(rowState(row({ decision: "ignored", reason: "not modelled" })).state, ROW.LEFT_OUT);
  assert.equal(rowState(row({ decision: "ignored", reason: "not modelled" })).blocks, false);

  assert.equal(
    rowState(row({ decision: "mapped", ref: "m1", proposed: true })).state,
    ROW.PROPOSED
  );

  const broken = rowState(row({ decision: "mapped", ref: "gone" }), {
    resolves: () => false,
    label: () => "Deleted malt",
  });
  assert.equal(broken.state, ROW.BROKEN);
  assert.equal(broken.blocks, true);
  assert.match(broken.message, /Deleted malt.*was deleted/);

  assert.equal(rowState(null).state, null);
});

test("a picked record that no longer resolves is broken, not picked", () => {
  const broken = rowState(row({ decision: "mapped", ref: "gone" }), { resolves: () => false });
  assert.equal(broken.state, ROW.BROKEN);
  assert.match(broken.message, /pick another, or create one/);
});

test("the yeasts section opens only when several strains are picked and none carries", () => {
  assert.equal(sectionState("yeasts", { yeastPicked: 1 }).state, "decided");
  assert.equal(sectionState("yeasts", { yeastPicked: 2, hasCarrier: true }).state, "decided");

  const open = sectionState("yeasts", { yeastPicked: 2, hasCarrier: false });
  assert.equal(open.state, "open");
  assert.match(open.issues[0].message, /choose the strain it takes/);
});

test("the hops section opens when a whirlpool charge has no split", () => {
  assert.equal(sectionState("hops", { whirlpoolPicked: false }).state, "decided");
  assert.equal(sectionState("hops", { whirlpoolPicked: true, hasSplit: true }).state, "decided");

  const open = sectionState("hops", { whirlpoolPicked: true, hasSplit: false });
  assert.equal(open.state, "open");
  assert.match(open.issues[0].message, /no IBU split/);
});

test("an unrelated section carries no issue", () => {
  assert.deepEqual(sectionState("fermentables", { yeastPicked: 2 }).issues, []);
});

test("the gate is unchecked, checking, fresh or stale — never silently old", () => {
  assert.equal(gateState({}), GATE.UNCHECKED);
  assert.equal(gateState({ checking: true }), GATE.CHECKING);
  assert.equal(gateState({ gate: { revision: 3 }, revision: 4 }), GATE.STALE);
  assert.equal(
    gateState({ gate: { revision: 4, blocking: [] }, revision: 4 }),
    GATE.FRESH_OK
  );
  assert.equal(
    gateState({ gate: { revision: 4, blocking: [{}] }, revision: 4 }),
    GATE.FRESH_BLOCKED
  );
  assert.equal(gateState({ gate: { revision: 4 }, revision: 4, open: true }), GATE.FRESH_BLOCKED);
  assert.equal(
    gateState({ gate: { revision: 3 }, revision: 4, open: true }),
    GATE.STALE,
    "staleness outranks an open mapping"
  );
});
