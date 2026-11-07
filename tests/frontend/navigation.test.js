import test from "node:test";
import assert from "node:assert/strict";

import { createNavigationActions } from "../../frontend/src/adapters/navigation.js";

function install(app, dependencies) {
  Object.assign(
    app,
    createNavigationActions({ ...dependencies, getView: dependencies.getView ?? (() => app) })
  );
}

function setup({ activeIndex = 0, highwater = 1, isEditorActive } = {}) {
  const ui = { activeIndex, highwater };
  const steps = [
    { id: "a", title: "Alpha" },
    { id: "b", title: "Beta" },
    { id: "c", title: "Gamma" },
  ];
  const app = {};
  install(app, { ui, steps, isEditorActive });
  app.syncNav();
  return { app, ui, steps };
}

test("syncNav mirrors the ui store onto the stepper", () => {
  const { app, steps } = setup({ activeIndex: 1, highwater: 1 });

  assert.equal(app.activeIndex, 1);
  assert.equal(app.highwater, 1);
  assert.equal(app.activeStep, steps[1]);
  assert.deepEqual(app.stepperSteps, [
    { id: "a", index: 0, title: "Alpha", state: "completed", disabled: false, ariaCurrent: null },
    { id: "b", index: 1, title: "Beta", state: "active", disabled: false, ariaCurrent: "step" },
    { id: "c", index: 2, title: "Gamma", state: "pending", disabled: true, ariaCurrent: null },
  ]);
});

test("reached steps are completed even ahead of the cursor", () => {
  const { app } = setup({ activeIndex: 0, highwater: 2 });

  assert.deepEqual(
    app.stepperSteps.map((step) => step.state),
    ["active", "completed", "completed"]
  );
  assert.deepEqual(
    app.stepperSteps.map((step) => step.disabled),
    [false, false, false]
  );
});

test("selectStep moves within the unlocked range", () => {
  const { app, ui } = setup({ activeIndex: 0, highwater: 2 });

  app.selectStep(2);
  assert.equal(ui.activeIndex, 2);
  assert.equal(app.activeStep.id, "c");

  app.selectStep(0);
  assert.equal(ui.activeIndex, 0);
  assert.equal(ui.highwater, 2);

  app.selectStep(-1);
  app.selectStep(3);
  assert.equal(ui.activeIndex, 0);
  assert.equal(ui.highwater, 2);
});

test("next advances, raises the highwater, and records the direction", () => {
  const { app, ui } = setup({ activeIndex: 0, highwater: 0 });

  app.next();

  assert.equal(ui.activeIndex, 1);
  assert.equal(ui.highwater, 1);
  assert.equal(app.navDir, "next");
  assert.deepEqual(
    app.stepperSteps.map((step) => step.state),
    ["completed", "active", "pending"]
  );
});

test("next stops at the last step", () => {
  const { app, ui } = setup({ activeIndex: 2, highwater: 2 });

  app.next();

  assert.equal(ui.activeIndex, 2);
  assert.equal(app.navDir, undefined);
});

test("prev moves back and stops at the first step", () => {
  const { app, ui } = setup({ activeIndex: 1, highwater: 2 });

  app.prev();
  assert.equal(ui.activeIndex, 0);
  assert.equal(app.navDir, "prev");

  app.prev();
  assert.equal(ui.activeIndex, 0);
});

test("keyNav ignores keystrokes inside form controls", () => {
  const { app, ui } = setup({ activeIndex: 0, highwater: 2 });
  const event = { target: { closest: () => ({ tagName: "INPUT" }) } };

  app.keyNav("next", event);
  app.keyNav("prev", event);

  assert.equal(ui.activeIndex, 0);
});

test("keyNav maps directions outside form controls", () => {
  const { app, ui } = setup({ activeIndex: 0, highwater: 2 });
  const event = { target: { closest: () => null } };

  app.keyNav("next", event);
  assert.equal(ui.activeIndex, 1);

  app.keyNav("prev", event);
  assert.equal(ui.activeIndex, 0);

  app.keyNav(undefined, undefined);
  assert.equal(ui.activeIndex, 1);
});

test("keyNav ignores keystrokes when editor is inactive", () => {
  const { app, ui } = setup({ activeIndex: 0, highwater: 2, isEditorActive: () => false });
  const event = { target: { closest: () => null } };

  app.keyNav("next", event);
  assert.equal(ui.activeIndex, 0);

  app.keyNav("prev", event);
  assert.equal(ui.activeIndex, 0);
});

test("resetToStep sets activeIndex, raises highwater, and syncs nav", () => {
  const { app, ui } = setup({ activeIndex: 0, highwater: 0 });

  app.resetToStep(1);
  assert.equal(ui.activeIndex, 1);
  assert.equal(ui.highwater, 1);
  assert.equal(app.activeIndex, 1);
  assert.equal(app.activeStep.id, "b");
  assert.equal(app.navDir, null);

  app.resetToStep(2);
  assert.equal(ui.activeIndex, 2);
  assert.equal(ui.highwater, 2);
  assert.equal(app.activeIndex, 2);
  assert.equal(app.activeStep.id, "c");
});

test("resetToStyle selects the style step and unlocks it", () => {
  const ui = { activeIndex: 0, highwater: 0 };
  const steps = [{ id: "equipment" }, { id: "style" }, { id: "yeast" }];
  const app = {};
  install(app, { ui, steps });
  app.syncNav();

  app.resetToStyle();
  assert.equal(ui.activeIndex, 1);
  assert.equal(ui.highwater, 1);
  assert.equal(app.activeStep.id, "style");
});
