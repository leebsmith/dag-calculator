// Reactive getters for the brew-session controller.

import {
  LEVEL_LABELS,
  STATUS_LABELS,
  cell,
  numberFrom,
  toleranceOf,
  verdictOf,
} from "./brewSessionModel.js";

function varianceRow(store, row) {
  const metricId = cell(row, "metric_id");
  const observation = metricId ? store.latestObservation(metricId) : null;
  const effective = observation
    ? observation.corrected?.value ?? observation.raw?.value
    : null;
  const expected = numberFrom(cell(row, "expected_number"));
  if (effective == null || expected == null) {
    return {
      label: cell(row, "title"),
      expected: cell(row, "expected"),
      actual: effective == null ? "not recorded" : String(effective),
      delta: "—",
      verdict: "missing",
    };
  }
  const delta = effective - expected;
  return {
    label: cell(row, "title"),
    expected: cell(row, "expected"),
    actual: String(effective),
    delta: delta.toFixed(3),
    verdict: verdictOf(effective, expected, toleranceOf(cell(row, "tolerance"), store.reportError)),
  };
}

export const brewSessionGetters = {
  get table() {
    return this.session?.plan_snapshot?.table ?? [];
  },

  get stepRows() {
    return this.table.filter((row) => cell(row, "kind") === "step");
  },

  get observationRows() {
    return this.table.filter((row) => cell(row, "kind") === "observation");
  },

  get stepSections() {
    const sections = [];
    for (const row of this.stepRows) {
      const key = `${cell(row, "phase")} · ${cell(row, "section")}`;
      let section = sections.find((entry) => entry.key === key);
      if (!section) {
        section = {
          key,
          phase: cell(row, "phase"),
          name: cell(row, "section"),
          rows: [],
        };
        sections.push(section);
      }
      section.rows.push(row);
    }
    return sections;
  },

  get levelLabel() {
    return LEVEL_LABELS[this.session?.level ?? this.level] ?? "Standard";
  },

  get statusLabel() {
    return STATUS_LABELS[this.session?.status ?? "planned"] ?? "Planned";
  },

  get sealed() {
    return Boolean(this.session?.finalized_at);
  },

  get summary() {
    const total = this.stepRows.length;
    const done = this.stepRows.filter((row) => this.stepState(row).done).length;
    return { total, done };
  },

  get variance() {
    return this.observationRows.map((row) => varianceRow(this, row));
  },
};
