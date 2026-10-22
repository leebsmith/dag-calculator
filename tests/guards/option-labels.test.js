// Choice labels: every choice node that renders as a `<select>` must label its
// whole taxonomy, so a new or renamed choice cannot surface as a raw code. The
// set is derived from the step manifest via the same projection the view uses,
// not from a hand-maintained list that can drift.

import test from "node:test";
import assert from "node:assert/strict";

import { projectFields } from "../../frontend/src/views/producer.js";
import { registry, steps } from "../../frontend/src/views/steps.js";
import { artifact } from "./util.js";

test("every choice-select field labels exactly its taxonomy members", () => {
  const a = artifact();
  const offenders = [];
  for (const f of projectFields(a, steps, registry)) {
    if (f.control !== "choice-select") continue;
    const members = [...(f.options ?? [])].sort();
    const labels = Object.keys(f.optionLabels ?? {}).sort();
    if (JSON.stringify(members) !== JSON.stringify(labels)) {
      offenders.push(`${f.id}: options [${members}] vs labels [${labels}]`);
    }
  }
  assert.deepEqual(offenders, [], offenders.join("\n"));
});
