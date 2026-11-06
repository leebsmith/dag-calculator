// Select and group checklist rows for rendering. Pure: the caller supplies the
// engine, the state rows and the level; the result is a fresh view model.

import {
  CHECKLIST_PHASES,
  CHECKLIST_SECTIONS,
  CHECKLIST_STEPS,
  LEVEL_RANK,
  OBSERVATION_METRICS,
  SECTION_BY_ID,
} from "../../checklist/catalog.js";
import { conditionHolds } from "./conditions.js";
import { createChecklistFormatter } from "./format.js";
import { providerText } from "./providers.js";
import { ignoreError } from "../../../observability.js";

function stateFor(stateRows) {
  return new Map((stateRows ?? []).map((row) => [row.step_id, row]));
}

function notApplicable(step) {
  return {
    kind: "step",
    phase: SECTION_BY_ID.get(step.section)?.phase ?? "brew",
    section: step.section,
    step_id: step.id,
    level: step.level,
    title: step.title,
    text: `N/A — ${step.condition?.replaceAll("_", " ") ?? "condition"} not met.`,
    done_when: "",
    detail: "",
    diagnostic: "",
    note: "",
    skipped: false,
    skip_reason: "",
    auto: step.kind === "auto",
    safety: !!step.safety,
    not_applicable: true,
  };
}

function stepRow(step, state, ctx) {
  const { fmt } = ctx;
  let text;
  try {
    text = providerText(step.provider, ctx) ?? fmt.text(step.text);
  } catch (err) {
    ctx.reportError("checklist.provider", err);
    text = fmt.text(step.text);
  }
  return {
    kind: "step",
    phase: SECTION_BY_ID.get(step.section)?.phase ?? "brew",
    section: step.section,
    step_id: step.id,
    level: step.level,
    title: step.title,
    text,
    done_when: fmt.text(step.done_when),
    detail: step.detail ? fmt.text(step.detail) : "",
    diagnostic: step.diagnostic ? fmt.text(step.diagnostic) : "",
    note: state?.note ?? "",
    skipped: !!state?.skipped,
    skip_reason: state?.skip_reason ?? "",
    auto: step.kind === "auto",
    safety: !!step.safety,
    not_applicable: false,
  };
}

function observationRow(metric, fmt, engine, reportError) {
  let expectedNumber = "—";
  if (metric.expected) {
    try {
      const value = engine.resolve(metric.expected);
      if (typeof value === "number") expectedNumber = String(value);
    } catch (err) {
      reportError("checklist.expected", err);
      expectedNumber = "—";
    }
  }
  return {
    kind: "observation",
    metric_id: metric.id,
    expected_number: expectedNumber,
    tolerance: JSON.stringify(metric.tolerance ?? {}),
    correction: metric.correction ?? "none",
    phase: metric.phase,
    section: metric.section,
    step_id: metric.step_id,
    level: metric.level,
    title: metric.label,
    text: "—",
    expected: metric.expected ? fmt.path(metric.expected) : "—",
    unit: metric.symbol ?? metric.unit ?? "—",
    method: (metric.methods ?? []).join(", ") || "—",
    raw: "—",
    corrected: "—",
    time: "—",
    note: "—",
  };
}

function collectStepRows({ engine, level, state, ctx }) {
  const rank = LEVEL_RANK[level] ?? LEVEL_RANK.info;
  const rows = [];
  for (const step of CHECKLIST_STEPS) {
    if ((LEVEL_RANK[step.level] ?? LEVEL_RANK.info) > rank) continue;
    if (!conditionHolds(step.condition, engine)) {
      if (level === "debug") rows.push(notApplicable(step));
      continue;
    }
    rows.push(stepRow(step, state.get(step.id), ctx));
  }
  return rows;
}

function collectObservationRows(fmt, level, engine, reportError) {
  const rank = LEVEL_RANK[level] ?? LEVEL_RANK.info;
  return OBSERVATION_METRICS
    .filter((metric) => (LEVEL_RANK[metric.level] ?? LEVEL_RANK.info) <= rank)
    .map((metric) => observationRow(metric, fmt, engine, reportError));
}

function groupRows(rows) {
  return CHECKLIST_PHASES.map((phase) => ({
    id: phase.id,
    name: phase.name,
    sections: CHECKLIST_SECTIONS.filter((section) => section.phase === phase.id)
      .map((section) => {
        const sectionRows = rows.filter(
          (row) => row.phase === phase.id && row.section === section.id
        );
        return {
          id: section.id,
          name: section.name,
          rows: sectionRows,
          count: sectionRows.filter((row) => row.kind === "step").length,
        };
      })
      .filter((section) => section.rows.length > 0),
  })).filter((phase) => phase.sections.length > 0);
}

export function selectChecklistRows({
  artifact,
  engine,
  unitMode = {},
  level = "info",
  stateRows = [],
  catalog = null,
  reportError = ignoreError,
}) {
  const fmt = createChecklistFormatter(artifact, engine, unitMode, catalog, reportError);
  const ctx = { artifact, engine, fmt, level, reportError };
  const state = stateFor(stateRows);
  const phases = groupRows(collectStepRows({ engine, level, state, ctx }));
  const observations = collectObservationRows(fmt, level, engine, reportError);
  if (observations.length > 0) {
    phases.push({
      id: "observations",
      name: "Observation Log",
      sections: [{ id: "observations", name: "Readings", rows: observations, count: 0 }],
    });
  }
  return phases;
}
