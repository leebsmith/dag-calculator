import { BREW_DAY_NODES as N } from "../../views/registry/brew-day.js";
import {
  buildBrewDayPayload,
  defaultBrewDayRows,
  materializeBrewDayRows,
} from "../../views/brewDay.js";
import { CHECKLIST_LEVELS, DEFAULT_LEVEL } from "../../views/checklist/catalog.js";
import { selectChecklistRows } from "../../views/producer/checklist/select.js";

const INITIAL_OPEN_SECTIONS = {
  pre: true,
  brew: false,
  post: false,
};

function updateRow(rows, stepId, patch) {
  return rows.map((row) => (row.step_id === stepId ? { ...row, ...patch } : row));
}

export function registerBrewDayCard(app, ctx) {
  const { engine } = ctx;

  Object.assign(app, {
    brewDayRows: defaultBrewDayRows(),
    brewDayOpenSections: { ...INITIAL_OPEN_SECTIONS },
    brewDayLevels: CHECKLIST_LEVELS,

    brewDayRow(stepId) {
      return this.brewDayRows.find((row) => row.step_id === stepId) ?? null;
    },

    toggleBrewDaySection(sectionId) {
      this.brewDayOpenSections[sectionId] = !this.brewDayOpenSections[sectionId];
    },

    isBrewDaySectionOpen(sectionId) {
      return !!this.brewDayOpenSections[sectionId];
    },

    setBrewDayLevel(level) {
      engine.setRoot(N.level, level);
      this.notify();
    },

    _writeBrewDayRows(rows) {
      this.brewDayRows = rows;
      engine.setCollection(N.steps, rows);
      this.notify();
    },

    setBrewDayNote(stepId, text) {
      this._writeBrewDayRows(updateRow(this.brewDayRows, stepId, { note: String(text ?? "") }));
    },

    setBrewDaySkipped(stepId, skipped) {
      this._writeBrewDayRows(updateRow(this.brewDayRows, stepId, { skipped: !!skipped }));
    },

    setBrewDaySkipReason(stepId, reason) {
      this._writeBrewDayRows(
        updateRow(this.brewDayRows, stepId, { skip_reason: String(reason ?? "") })
      );
    },
  });

  Object.defineProperties(app, {
    brewDayLevel: {
      configurable: true,
      get() {
        return engine.get(N.level) ?? DEFAULT_LEVEL;
      },
    },
    brewDaySections: {
      configurable: true,
      get() {
        return selectChecklistRows({
          artifact: ctx.artifact,
          engine,
          unitMode: this.unitMode,
          level: this.brewDayLevel,
          stateRows: this.brewDayRows,
        });
      },
    },
    brewDayPayload: {
      configurable: true,
      get() {
        return buildBrewDayPayload(this.brewDaySections);
      },
    },
  });
}

export function refreshBrewDayCard(app, ctx) {
  app.brewDayRows = materializeBrewDayRows(ctx.engine.get(N.steps));
}

export const KEYS = [
  "brewDayRows",
  "brewDayOpenSections",
  "brewDayLevels",
  "brewDayRow",
  "toggleBrewDaySection",
  "isBrewDaySectionOpen",
  "setBrewDayLevel",
  "_writeBrewDayRows",
  "setBrewDayNote",
  "setBrewDaySkipped",
  "setBrewDaySkipReason",
  "brewDayLevel",
  "brewDaySections",
  "brewDayPayload",
];
