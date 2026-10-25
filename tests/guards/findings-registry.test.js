import test from "node:test";
import assert from "node:assert/strict";

import {
  RELATION_FINDINGS,
  actionFor,
  findingFor,
  severityFor,
} from "../../frontend/src/views/registry/findings.js";
import { artifact } from "./util.js";

const RELATIONS = artifact().relations;
const FORMATTED = (operand) => `⟦${operand.dimension}⟧`;

const SAMPLES = {
  hlt_not_overfilled: {
    lhs: { value: 38, dimension: "volume" },
    rhs: { value: 30, dimension: "volume" },
  },
  hlt_above_coil_floor: {
    lhs: { value: 3, dimension: "volume" },
    rhs: { value: 4, dimension: "volume" },
  },
  kettle_not_overfilled: {
    lhs: { value: 44, dimension: "volume" },
    rhs: { value: 40, dimension: "volume" },
  },
  target_abv_reachable: {
    lhs: { value: 9, dimension: "percentage" },
    rhs: { value: 8.1, dimension: "percentage" },
  },
  mash_thickness_above_equipment_floor: {
    thickness: { value: 2.0, dimension: "mash_thickness" },
    floor: { value: 2.295, dimension: "mash_thickness" },
  },
};

test("every declared relation has a finding entry", () => {
  assert.deepEqual(
    Object.keys(RELATION_FINDINGS).sort(),
    RELATIONS.map((relation) => relation.id).sort()
  );
});

test("every finding has sample operands for the message test", () => {
  assert.deepEqual(Object.keys(SAMPLES).sort(), Object.keys(RELATION_FINDINGS).sort());
});

test("severity follows the artifact blocking flag", () => {
  assert.equal(severityFor({ blocking: true }), "error");
  assert.equal(severityFor({ blocking: false }), "warning");
  assert.equal(severityFor({}), "warning");
});

test("every message formats through the caller's formatter", () => {
  for (const relation of RELATIONS) {
    const finding = findingFor(relation, SAMPLES[relation.id], FORMATTED);
    assert.ok(finding.message.includes("⟦"), `${relation.id} did not format its operands`);
    assert.ok(
      !/\d/.test(finding.message),
      `${relation.id} leaked a raw number instead of a formatted operand`
    );
  }
});

test("the formatter decides the units, not the registry", () => {
  const relation = RELATIONS.find((r) => r.id === "hlt_not_overfilled");
  const metric = findingFor(relation, SAMPLES.hlt_not_overfilled, (o) => `${o.value} L`);
  const imperial = findingFor(relation, SAMPLES.hlt_not_overfilled, (o) => `${o.value} gal`);
  assert.notEqual(metric.message, imperial.message);
});

test("metadata is available before a solve and actions are explicit", () => {
  for (const relation of RELATIONS) {
    const finding = findingFor(relation);
    assert.equal(finding.id, relation.id);
    assert.ok(finding.label);
    assert.equal(finding.message, null);
    assert.deepEqual(finding.action, actionFor(relation));
  }
});
