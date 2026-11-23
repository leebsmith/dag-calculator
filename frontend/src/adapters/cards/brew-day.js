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

// The checklist-level picker's field schema. A module-level factory keeps the
// card's action object under the function-length cap; the method is still called
// as an app member, so `this` is the reactive root.
function levelFieldActions() {
  return {
    brewDayLevelFields() {
      const app = this;
      return [
        {
          id: "checklist-level",
          type: "select",
          label: "Checklist level",
          read: () => app.brewDayLevel,
          write: (value) => app.setBrewDayLevel(value),
          options: () => app.brewDayLevels.map((level) => ({ value: level.id, label: level.name })),
          commit: "change",
          hint: "Critical path is the short gate list; Standard is the full brew sheet; Diagnostic adds expected values, methods and model caveats.",
        },
      ];
    },
  };
}

export function createBrewDayCard({ engine, artifact, getView, observability }) {
  const actions = {
    brewDayRows: defaultBrewDayRows(),
    brewDayLevel: selectBrewDayLevel({ level: engine.get(N.level) }),
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

    ...levelFieldActions(),

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
          reportError: observability?.reportError,
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

export function createBrewDayLayers(ctx) {
  return [createBrewDayCard(ctx)];
}

export function refreshBrewDayCard(app, ctx) {
  app.brewDayRows = materializeBrewDayRows(ctx.engine.get(N.steps));
  app.brewDayLevel = selectBrewDayLevel({ level: ctx.engine.get(N.level) });
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
  "brewDayLevelFields",
];
