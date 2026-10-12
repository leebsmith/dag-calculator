import test from "node:test";
import assert from "node:assert/strict";
import { projectFields } from "../../frontend/src/views/producer.js";
import { registry, steps } from "../../frontend/src/views/steps.js";
import { artifact } from "./util.js";

// A5: every editable field carries exactly one valid write target; no readout does.
const SCOPES = ["root", "choice", "overlay", "collection"];

test("A5: write-target coverage", () => {
  const fields = projectFields(artifact(), steps, registry);
  const offenders = [];
  for (const f of fields) {
    if (f.editable) {
      if (!f.target || !SCOPES.includes(f.target.scope)) {
        offenders.push(`no/invalid target: ${f.id}`);
        continue;
      }
      if (f.target.scope === "overlay" && !(f.target.selectionNodeId && f.target.field)) {
        offenders.push(`bad overlay target: ${f.id}`);
      }
      if (f.target.scope === "collection" && !f.target.nodeId) {
        offenders.push(`bad collection target: ${f.id}`);
      }
    } else if (f.target) {
      offenders.push(`readout has a target: ${f.id}`);
    }
  }
  assert.deepEqual(offenders, [], offenders.join("\n"));
});
