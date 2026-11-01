// Checklist seed join and persisted-row materializer. The engine-facing view
// model lives in `views/checklist/`; this module owns the seed aliases and the
// migration from the retired brew-day collection.

import {
  CHECKLIST_PROCESS,
  CHECKLIST_SECTIONS,
  CHECKLIST_STEPS,
  defaultChecklistRows,
  materializeChecklistRows,
} from "./checklist/catalog.js";

export const BREW_DAY_PROCESS = CHECKLIST_PROCESS;
export const BREW_DAY_SECTIONS = CHECKLIST_SECTIONS;
export const BREW_DAY_STEPS = CHECKLIST_STEPS;

export const defaultBrewDayRows = defaultChecklistRows;
export const materializeBrewDayRows = materializeChecklistRows;

export function buildBrewDayPayload(phases = []) {
  return { process: CHECKLIST_PROCESS, phases };
}
