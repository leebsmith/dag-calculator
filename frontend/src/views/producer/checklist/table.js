// Freeze-time checklist table. Every cell is a display string; the report
// generator never formats or converts.

import { selectChecklistRows } from "./select.js";

function cell(text) {
  return { text: String(text ?? "—") || "—" };
}

function stepCells(row, phaseName, sectionName) {
  return {
    kind: cell("step"),
    step_id: cell(row.step_id),
    metric_id: cell("—"),
    expected_number: cell("—"),
    tolerance: cell("—"),
    correction: cell("—"),
    phase: cell(phaseName),
    section: cell(sectionName),
    title: cell(row.title),
    text: cell(row.text),
    done_when: cell(row.done_when),
    level: cell(row.level),
    expected: cell("—"),
    unit: cell("—"),
    method: cell("—"),
    note: cell(row.note || "—"),
    skipped: cell(row.skipped ? `Skipped: ${row.skip_reason || "no reason"}` : "—"),
    raw: cell("—"),
    corrected: cell("—"),
    time: cell("—"),
  };
}

function observationCells(row, phaseName, sectionName) {
  return {
    kind: cell("observation"),
    step_id: cell(row.step_id),
    metric_id: cell(row.metric_id),
    expected_number: cell(row.expected_number),
    tolerance: cell(row.tolerance),
    correction: cell(row.correction),
    phase: cell(phaseName),
    section: cell(sectionName),
    title: cell(row.title),
    text: cell("—"),
    level: cell(row.level),
    expected: cell(row.expected),
    unit: cell(row.unit),
    method: cell(row.method),
    note: cell("—"),
    skipped: cell("—"),
    raw: cell(row.raw),
    corrected: cell(row.corrected),
    time: cell(row.time),
  };
}

export function buildChecklistTable({
  artifact,
  catalog,
  engine,
  level = "info",
  stateRows = [],
}) {
  const phases = selectChecklistRows({
    artifact,
    engine,
    level,
    stateRows,
    catalog,
  });
  return phases.flatMap((phase) =>
    phase.sections.flatMap((section) =>
      section.rows.map((row) =>
        row.kind === "observation"
          ? observationCells(row, phase.name, section.name)
          : stepCells(row, phase.name, section.name)
      )
    )
  );
}
