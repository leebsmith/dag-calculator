// Checklist catalog: the authored phases, sections, steps and observation
// metrics. Pure data and migration helpers; no engine, DOM or store access.

import seed from "../../../../data/seeds/brew-checklist.json" with { type: "json" };
import observations from "../../../../data/seeds/brew-observations.json" with { type: "json" };

export const CHECKLIST_PROCESS = seed.process;
export const CHECKLIST_LEVELS = seed.levels;
export const CHECKLIST_PHASES = seed.phases;
export const CHECKLIST_SECTIONS = seed.sections;
export const CHECKLIST_STEPS = seed.steps;
export const OBSERVATION_METRICS = observations.metrics;
export const DEFAULT_LEVEL = seed.default_level;

export const LEVEL_RANK = Object.fromEntries(seed.levels.map((level) => [level.id, level.rank]));
export const STEP_BY_ID = new Map(seed.steps.map((step) => [step.id, step]));
export const SECTION_BY_ID = new Map(seed.sections.map((section) => [section.id, section]));

export function sectionOf(step) {
  return SECTION_BY_ID.get(step.section) ?? null;
}

export function defaultChecklistRows() {
  return CHECKLIST_STEPS.map((step) => ({
    step_id: step.id,
    note: "",
    skipped: false,
    skip_reason: "",
  }));
}

export function materializeChecklistRows(rows = []) {
  const byId = new Map((rows ?? []).map((row) => [row.step_id, row]));
  return CHECKLIST_STEPS.map((step) => {
    const row = byId.get(step.id) ?? {};
    return {
      step_id: step.id,
      note: row.note ?? row.instructions ?? "",
      skipped: !!row.skipped,
      skip_reason: row.skip_reason ?? "",
    };
  });
}

export function migrateChecklistCollections(collections = {}) {
  const legacy = collections?.["batch.brew_day_steps"];
  if (!Array.isArray(legacy)) return { collections, changed: false };
  const current = collections["batch.brew_checklist"];
  const migrated = legacy.map((row) => ({
    step_id: row.step_id,
    note: row.note ?? row.instructions ?? "",
    skipped: !!row.skipped,
    skip_reason: row.skip_reason ?? "",
  }));
  const byId = new Map(migrated.map((row) => [row.step_id, row]));
  const merged = (current ?? []).map((row) => {
    const old = byId.get(row.step_id);
    return old && !row.note ? { ...row, note: old.note } : row;
  });
  const known = new Set(merged.map((row) => row.step_id));
  const next = {
    ...collections,
    "batch.brew_checklist": [...merged, ...migrated.filter((row) => !known.has(row.step_id))],
  };
  delete next["batch.brew_day_steps"];
  return { collections: next, changed: true };
}
