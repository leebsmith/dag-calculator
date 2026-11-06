// Brew-day pure data and selectors: the checklist seed aliases, the persisted
// row materializer, the open-section defaults, row selection/patching, and the
// payload builder. The card adapter owns engine reads and state writes; the
// selectors here take the engine or rows as explicit, read-only arguments.

import {
  CHECKLIST_LEVELS,
  CHECKLIST_PROCESS,
  CHECKLIST_SECTIONS,
  CHECKLIST_STEPS,
  DEFAULT_LEVEL,
  defaultChecklistRows,
  materializeChecklistRows,
} from "./checklist/catalog.js";
import { selectChecklistRows } from "./producer/checklist/select.js";

export const BREW_DAY_PROCESS = CHECKLIST_PROCESS;
export const BREW_DAY_SECTIONS = CHECKLIST_SECTIONS;
export const BREW_DAY_STEPS = CHECKLIST_STEPS;
export const BREW_DAY_LEVELS = CHECKLIST_LEVELS;

export const INITIAL_OPEN_SECTIONS = {
  pre: true,
  brew: false,
  post: false,
};

export const defaultBrewDayRows = defaultChecklistRows;
export const materializeBrewDayRows = materializeChecklistRows;

export function buildBrewDayPayload(phases = []) {
  return { process: CHECKLIST_PROCESS, phases };
}

export function selectBrewDayRow(rows, stepId) {
  return (rows ?? []).find((row) => row.step_id === stepId) ?? null;
}

export function updateBrewDayRow(rows, stepId, patch) {
  return (rows ?? []).map((row) => (row.step_id === stepId ? { ...row, ...patch } : row));
}

export function selectBrewDayLevel({ level } = {}) {
  return level ?? DEFAULT_LEVEL;
}

export function selectBrewDaySections({
  artifact,
  engine,
  unitMode = {},
  level = DEFAULT_LEVEL,
  stateRows = [],
  catalog = null,
}) {
  return selectChecklistRows({
    artifact,
    engine,
    unitMode,
    level,
    stateRows,
    catalog,
  });
}
