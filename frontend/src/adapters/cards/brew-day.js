import { BREW_DAY_NODES as N } from "../../views/registry/brew-day.js";
import {
  buildBrewDayPayload,
  defaultBrewDayRows,
  groupBrewDayRows,
  materializeBrewDayRows,
} from "../../views/brewDay.js";

const INITIAL_OPEN_SECTIONS = {
  preparation: true,
  mashing: false,
  boil: false,
  knockout: false,
};

export function registerBrewDayCard(app, ctx) {
  const { engine } = ctx;

  Object.assign(app, {
    brewDayRows: defaultBrewDayRows(),
    brewDayOpenSections: { ...INITIAL_OPEN_SECTIONS },

    brewDayRow(stepId) {
      return this.brewDayRows.find((row) => row.step_id === stepId) ?? null;
    },

    toggleBrewDaySection(sectionId) {
      this.brewDayOpenSections[sectionId] = !this.brewDayOpenSections[sectionId];
    },

    isBrewDaySectionOpen(sectionId) {
      return !!this.brewDayOpenSections[sectionId];
    },

    _writeBrewDayRows(rows) {
      this.brewDayRows = rows;
      engine.setCollection(N.steps, rows);
      this.notify();
    },

    toggleBrewDayStep(stepId, enabled) {
      const rows = this.brewDayRows.map((row) =>
        row.step_id === stepId ? { ...row, enabled: !!enabled } : row
      );
      this._writeBrewDayRows(rows);
    },

    setBrewDayInstruction(stepId, text) {
      const rows = this.brewDayRows.map((row) =>
        row.step_id === stepId ? { ...row, instructions: text } : row
      );
      this._writeBrewDayRows(rows);
    },

    brewDayDefaultInstruction() {
      return "";
    },

    brewDayInstruction(row) {
      return row?.instructions || this.brewDayDefaultInstruction(row?.step_id);
    },
  });

  Object.defineProperties(app, {
    brewDaySections: {
      configurable: true,
      get() {
        return groupBrewDayRows(this.brewDayRows);
      },
    },
    brewDayPayload: {
      configurable: true,
      get() {
        return buildBrewDayPayload(this.brewDayRows, (stepId) =>
          this.brewDayDefaultInstruction(stepId)
        );
      },
    },
  });
}

export function refreshBrewDayCard(app, ctx) {
  app.brewDayRows = materializeBrewDayRows(ctx.engine.get(N.steps));
}
