import test from "node:test";
import assert from "node:assert/strict";

import { installNavigation } from "../../frontend/src/adapters/navigation.js";

function setup({ activeIndex = 0, highwater = 1 } = {}) {
  const ui = { activeIndex, highwater };
  const steps = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const app = {};
  installNavigation(app, { ui, steps });
  app.syncNav();
  return { app, ui, steps };
}

test("syncNav mirrors the ui store onto the rail", () => {
  const { app, steps } = setup({ activeIndex: 1, highwater: 1 });

  assert.equal(app.activeIndex, 1);
  assert.equal(app.highwater, 1);
  assert.equal(app.activeStep, steps[1]);
  assert.deepEqual(app.visibleSteps, [
    { ...steps[0], index: 0, active: false, complete: true },
    { ...steps[1], index: 1, active: true, complete: false },
  ]);
});

test("selectStep moves within the unlocked range", () => {
  const { app, ui } = setup({ activeIndex: 0, highwater: 2 });

  app.selectStep(2);
  assert.equal(ui.activeIndex, 2);
  assert.equal(app.activeStep.id, "c");

  app.selectStep(0);
  assert.equal(ui.activeIndex, 0);

  app.selectStep(-1);
  app.selectStep(3);
  assert.equal(ui.activeIndex, 0);
});

test("next advances, raises the highwater, and records the direction", () => {
  const { app, ui } = setup({ activeIndex: 0, highwater: 0 });

  app.next();

  assert.equal(ui.activeIndex, 1);
  assert.equal(ui.highwater, 1);
  assert.equal(app.navDir, "next");
  assert.equal(app.visibleSteps.length, 2);
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
