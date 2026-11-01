// The checklist catalog is data: a typo in a step, a missing provider or an
// unresolved expected path is a guard failure, not a runtime surprise.

import test from "node:test";
import assert from "node:assert/strict";

import { allClaims, resolves } from "../../scripts/docs-claims.mjs";
import { CONDITION_IDS } from "../../frontend/src/views/producer/checklist/conditions.js";
import { PROVIDER_IDS } from "../../frontend/src/views/producer/checklist/providers.js";
import { CHECKLIST_LEVELS, CHECKLIST_PHASES, CHECKLIST_SECTIONS, CHECKLIST_STEPS, OBSERVATION_METRICS } from "../../frontend/src/views/checklist/catalog.js";

const LEVELS = new Set(CHECKLIST_LEVELS.map((level) => level.id));
const PHASES = new Set(CHECKLIST_PHASES.map((phase) => phase.id));
const SECTIONS = new Map(CHECKLIST_SECTIONS.map((section) => [section.id, section]));
const KINDS = new Set(["action", "check", "measure", "auto", "note"]);
const CONDITIONS = new Set(["always", ...CONDITION_IDS]);
const PROVIDERS = new Set(PROVIDER_IDS);
const CLAIMS = allClaims();

test("checklist step ids are unique and structurally valid", () => {
  const ids = new Set();
  for (const step of CHECKLIST_STEPS) {
    assert.ok(!ids.has(step.id), `duplicate step id: ${step.id}`);
    ids.add(step.id);
    assert.ok(LEVELS.has(step.level), `${step.id}: unknown level ${step.level}`);
    assert.ok(KINDS.has(step.kind), `${step.id}: unknown kind ${step.kind}`);
    assert.ok(SECTIONS.has(step.section), `${step.id}: unknown section ${step.section}`);
    assert.ok(PHASES.has(SECTIONS.get(step.section).phase), `${step.id}: unknown phase`);
    assert.ok(step.title, `${step.id}: missing title`);
    assert.ok(step.text, `${step.id}: missing text`);
    assert.ok(step.done_when, `${step.id}: missing done_when`);
    assert.ok(!step.condition || CONDITIONS.has(step.condition), `${step.id}: unknown condition`);
    assert.ok(!step.provider || PROVIDERS.has(step.provider), `${step.id}: unknown provider`);
    for (const metric of step.observations ?? []) {
      assert.ok(
        OBSERVATION_METRICS.some((entry) => entry.id === metric),
        `${step.id}: unknown observation metric ${metric}`
      );
    }
  }
});

test("the critical path stays short", () => {
  const critical = CHECKLIST_STEPS.filter((step) => step.level === "critical");
  assert.ok(critical.length <= 35, `critical path has ${critical.length} steps`);
  assert.ok(critical.length >= 20, `critical path has only ${critical.length} steps`);
});

test("observation metrics are unique and their expected paths resolve", () => {
  const ids = new Set();
  for (const metric of OBSERVATION_METRICS) {
    assert.ok(!ids.has(metric.id), `duplicate metric id: ${metric.id}`);
    ids.add(metric.id);
    assert.ok(LEVELS.has(metric.level), `${metric.id}: unknown level`);
    assert.ok(SECTIONS.has(metric.section), `${metric.id}: unknown section`);
    assert.ok(metric.symbol, `${metric.id}: missing display symbol`);
    assert.ok(Array.isArray(metric.methods) && metric.methods.length > 0, `${metric.id}: no methods`);
    if (metric.expected) {
      assert.ok(resolves(metric.expected, CLAIMS), `${metric.id}: unresolved ${metric.expected}`);
    }
  }
});

test("every observation step id exists", () => {
  const steps = new Set(CHECKLIST_STEPS.map((step) => step.id));
  for (const metric of OBSERVATION_METRICS) {
    assert.ok(steps.has(metric.step_id), `${metric.id}: unknown step ${metric.step_id}`);
  }
});
