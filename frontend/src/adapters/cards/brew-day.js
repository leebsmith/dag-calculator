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

export function createBrewDayCard({ engine, artifact, getView }) {
  const actions = {
    brewDayRows: defaultBrewDayRows(),
    brewDayOpenSections: { ...INITIAL_OPEN_SECTIONS },
    brewDayLevels: BREW_DAY_LEVELS,

    brewDayRow(stepId) {
      return selectBrewDayRow(getView().brewDayRows, stepId);
    },

    toggleBrewDaySection(sectionId) {
      const view = getView();
      view.brewDayOpenSections[sectionId] = !view.brewDayOpenSections[sectionId];
    },

    isBrewDaySectionOpen(sectionId) {
      return !!getView().brewDayOpenSections[sectionId];
    },

    setBrewDayLevel(level) {
      engine.setRoot(N.level, level);
      getView().compute();
      getView().notify();
    },

    _writeBrewDayRows(rows) {
      getView().brewDayRows = rows;
      engine.setCollection(N.steps, rows);
      getView().compute();
      getView().notify();
    },

    setBrewDayNote(stepId, text) {
      actions._writeBrewDayRows(
        updateBrewDayRow(getView().brewDayRows, stepId, { note: String(text ?? "") })
      );
    },

    setBrewDaySkipped(stepId, skipped) {
      actions._writeBrewDayRows(
        updateBrewDayRow(getView().brewDayRows, stepId, { skipped: !!skipped })
      );
    },

    setBrewDaySkipReason(stepId, reason) {
      actions._writeBrewDayRows(
        updateBrewDayRow(getView().brewDayRows, stepId, { skip_reason: String(reason ?? "") })
      );
    },
  };

  Object.defineProperties(actions, {
    brewDayLevel: {
      configurable: true,
      get() {
        return selectBrewDayLevel({ level: engine.get(N.level) });
      },
    },
    brewDaySections: {
      configurable: true,
      get() {
        const view = getView();
        return selectBrewDaySections({
          artifact,
          engine,
          unitMode: view.unitMode,
          level: view.brewDayLevel,
          stateRows: view.brewDayRows,
        });
      },
    },
    brewDayPayload: {
      configurable: true,
      get() {
        return buildBrewDayPayload(getView().brewDaySections);
      },
    },
  });
  return actions;
}

export function registerBrewDayCard(app, ctx = {}) {
  const actions = createBrewDayCard({ ...ctx, getView: ctx.getView ?? (() => app) });
  Object.defineProperties(app, Object.getOwnPropertyDescriptors(actions));
  return actions;
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
