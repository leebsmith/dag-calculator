// Brew-day pure data and selectors: the checklist seed aliases, the persisted
// row materializer, the open-section defaults, row selection/patching, and the
// payload builder. The card adapter owns engine reads and state writes; the
// selectors here take the engine or rows as explicit, read-only arguments.

import { ignoreError } from "../observability.js";
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

/**
 * Build the empty checklist rows.
 *
 * @pure
 * @returns {ReadonlyArray<{ readonly step_id: string, readonly note: string, readonly skipped: boolean, readonly skip_reason: string }>}
 */
export const defaultBrewDayRows = defaultChecklistRows;

/**
 * Materialize persisted checklist rows in canonical order.
 *
 * @pure
 * @param {ReadonlyArray<Readonly<{ readonly step_id: string, readonly note?: string, readonly instructions?: string, readonly skipped?: boolean, readonly skip_reason?: string }>>} [rows]
 * @returns {ReadonlyArray<{ readonly step_id: string, readonly note: string, readonly skipped: boolean, readonly skip_reason: string }>}
 */
export const materializeBrewDayRows = materializeChecklistRows;

/**
 * Assemble the brew-day payload from the selected phases.
 *
 * @pure
 * @param {ReadonlyArray<object>} [phases]
 * @returns {{ readonly process: object, readonly phases: ReadonlyArray<object> }}
 */
export function buildBrewDayPayload(phases = []) {
  return { process: CHECKLIST_PROCESS, phases };
}

/**
 * Select one checklist row by step id.
 *
 * @pure
 * @param {ReadonlyArray<Readonly<{ readonly step_id: string }>>|null} rows
 * @param {string} stepId
 * @returns {Readonly<object>|null}
 */
export function selectBrewDayRow(rows, stepId) {
  return (rows ?? []).find((row) => row.step_id === stepId) ?? null;
}

/**
 * Return a new row array with one step patched.
 *
 * @pure
 * @param {ReadonlyArray<Readonly<{ readonly step_id: string }>>|null} rows
 * @param {string} stepId
 * @param {Readonly<Record<string, unknown>>} patch
 * @returns {ReadonlyArray<object>}
 */
export function updateBrewDayRow(rows, stepId, patch) {
  return (rows ?? []).map((row) => (row.step_id === stepId ? { ...row, ...patch } : row));
}

/**
 * Resolve the checklist level from explicit state.
 *
 * @pure
 * @param {{ readonly level?: string }} [state]
 * @returns {string}
 */
export function selectBrewDayLevel({ level } = {}) {
  return level ?? DEFAULT_LEVEL;
}

// The silent `reportError` default is for direct unit tests; the brew-day card
// passes the app reporter.
/**
 * Select and group the checklist rows for the current state.
 *
 * @pure
 * @param {{ readonly artifact: object, readonly engine: object, readonly unitMode?: Readonly<Record<string, string>>, readonly level?: string, readonly stateRows?: ReadonlyArray<object>, readonly catalog?: object|null }} args
 * @returns {ReadonlyArray<object>}
 */
export function selectBrewDaySections({
  artifact,
  engine,
  unitMode = {},
  level = DEFAULT_LEVEL,
  stateRows = [],
  catalog = null,
  reportError = ignoreError,
}) {
  return selectChecklistRows({
    artifact,
    engine,
    unitMode,
    level,
    stateRows,
    catalog,
    reportError,
  });
}
