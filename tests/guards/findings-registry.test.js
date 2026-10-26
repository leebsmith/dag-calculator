import test from "node:test";
import assert from "node:assert/strict";

import {
  HOST_FINDINGS,
  RELATION_FINDINGS,
  actionFor,
  findingFor,
  hostFinding,
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
  hlt_demand_not_overfilled: {
    lhs: { value: 5, dimension: "volume" },
    rhs: { value: 30, dimension: "volume" },
  },
  kettle_not_overfilled: {
    lhs: { value: 44, dimension: "volume" },
    rhs: { value: 40, dimension: "volume" },
  },
  mash_tun_not_overfilled: {
    lhs: { value: 44, dimension: "volume" },
    rhs: { value: 40, dimension: "volume" },
  },
  mash_thickness_above_equipment_floor: {
    thickness: { value: 2.0, dimension: "mash_thickness" },
    floor: { value: 2.295, dimension: "mash_thickness" },
  },
  mash_thickness_below_ceiling: {
    thickness: { value: 5.0, dimension: "mash_thickness" },
    ceiling: { value: 4.1727, dimension: "mash_thickness" },
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

test("host-only advisories are declared, warned, and never block", () => {
  assert.deepEqual(Object.keys(HOST_FINDINGS), [
    "sta1_unknown",
    "sugar_share_without_sugar",
    "sugar_share_high",
  ]);

  const advisory = hostFinding("sta1_unknown");
  assert.equal(advisory.severity, "warning");
  assert.equal(advisory.action, null);
  assert.match(advisory.message, /STA1/);
  assert.match(advisory.message, /d = 0/);
  assert.equal(hostFinding("not_a_finding"), null);

  const shareWithoutSugar = hostFinding("sugar_share_without_sugar");
  assert.equal(shareWithoutSugar.severity, "warning");
  assert.match(shareWithoutSugar.message, /no late-addition rows/);

  const highShare = hostFinding("sugar_share_high");
  assert.equal(highShare.severity, "warning");
  assert.match(highShare.message, /90%/);
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

test("the thickness ceiling carries the one-shot pin action", () => {
  const ceiling = RELATIONS.find((relation) => relation.id === "mash_thickness_below_ceiling");
  assert.deepEqual(actionFor(ceiling), {
    handler: "pinMashThickness",
    label: "Use the rig-default mash thickness",
  });
});
