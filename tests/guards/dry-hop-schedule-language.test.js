// The schedule descriptor lives in the artifact; the language module carries the
// same vocabulary so it can run without an artifact instance. This guard keeps
// the two identical and pins the merged event order.

import test from "node:test";
import assert from "node:assert/strict";

import { SCHEDULE_LANGUAGE } from "../../frontend/src/views/dryHopSchedule.js";
import { artifact } from "./util.js";

const ARTIFACT = artifact();
const DESCRIPTOR = ARTIFACT.schedules?.dry_hop;

const withoutLabels = (entries) =>
  entries.map((entry) =>
    Object.fromEntries(Object.entries(entry).filter(([key]) => key !== "label"))
  );

test("the artifact grammar matches the language module", () => {
  assert.ok(DESCRIPTOR, "artifact.schedules.dry_hop is missing");
  assert.equal(DESCRIPTOR.time.unit, SCHEDULE_LANGUAGE.time.unit);
  assert.equal(DESCRIPTOR.time.decimals, undefined, "precision is presentation, not grammar");
  assert.deepEqual(
    DESCRIPTOR.events,
    SCHEDULE_LANGUAGE.events.map(({ id, rank }) => ({ id, rank }))
  );
  for (const group of ["application", "contact", "references"]) {
    assert.deepEqual(
      DESCRIPTOR[group],
      withoutLabels(SCHEDULE_LANGUAGE[group]),
      `${group} drifted from the module`
    );
  }
});

test("the event order is dense and every variant is identified once", () => {
  assert.deepEqual(
    DESCRIPTOR.events.map((event) => event.rank),
    DESCRIPTOR.events.map((_, index) => index)
  );
  for (const group of ["application", "contact", "references", "events"]) {
    const ids = DESCRIPTOR[group].map((entry) => entry.id);
    assert.equal(new Set(ids).size, ids.length, `${group} has a duplicate id`);
    const labels = SCHEDULE_LANGUAGE[group].map((entry) => entry.label);
    for (const label of labels) assert.ok(label?.trim(), `${group} has an unlabelled variant`);
  }
});
