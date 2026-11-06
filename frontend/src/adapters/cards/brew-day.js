import { BREW_DAY_NODES as N } from "../../views/registry/brew-day.js";
import {
  BREW_DAY_LEVELS,
  INITIAL_OPEN_SECTIONS,
  buildBrewDayPayload,
  defaultBrewDayRows,
  materializeBrewDayRows,
  selectBrewDayLevel,
  selectBrewDayRow,
  selectBrewDaySections,
  updateBrewDayRow,
} from "../../views/brewDayLogic.js";

export function registerBrewDayCard(app, ctx) {
  const { engine } = ctx;

  Object.assign(app, {
    brewDayRows: defaultBrewDayRows(),
    brewDayOpenSections: { ...INITIAL_OPEN_SECTIONS },
    brewDayLevels: BREW_DAY_LEVELS,

    brewDayRow(stepId) {
      return selectBrewDayRow(this.brewDayRows, stepId);
    },

    toggleBrewDaySection(sectionId) {
      this.brewDayOpenSections[sectionId] = !this.brewDayOpenSections[sectionId];
    },

    isBrewDaySectionOpen(sectionId) {
      return !!this.brewDayOpenSections[sectionId];
    },

    setBrewDayLevel(level) {
      engine.setRoot(N.level, level);
      this.compute();
      this.notify();
    },

    _writeBrewDayRows(rows) {
      this.brewDayRows = rows;
      engine.setCollection(N.steps, rows);
      this.compute();
      this.notify();
    },

    setBrewDayNote(stepId, text) {
      this._writeBrewDayRows(
        updateBrewDayRow(this.brewDayRows, stepId, { note: String(text ?? "") })
      );
    },

    setBrewDaySkipped(stepId, skipped) {
      this._writeBrewDayRows(
        updateBrewDayRow(this.brewDayRows, stepId, { skipped: !!skipped })
      );
    },

    setBrewDaySkipReason(stepId, reason) {
      this._writeBrewDayRows(
        updateBrewDayRow(this.brewDayRows, stepId, { skip_reason: String(reason ?? "") })
      );
    },
  });

  Object.defineProperties(app, {
    brewDayLevel: {
      configurable: true,
      get() {
        return selectBrewDayLevel({ level: engine.get(N.level) });
      },
    },
    brewDaySections: {
      configurable: true,
      get() {
        return selectBrewDaySections({
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
