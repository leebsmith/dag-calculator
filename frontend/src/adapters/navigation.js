// Step navigation: keeps the app's visible rail in sync with the UI store and
// mirrors the rail with keyboard/button navigation. The factory receives an
// explicit view accessor so its methods never depend on Alpine's `this`.

export function createNavigationActions({
  ui,
  steps,
  isEditorActive = () => true,
  getView,
}) {
  function syncNav() {
    const view = getView();
    view.activeIndex = ui.activeIndex;
    view.highwater = ui.highwater;
    view.activeStep = steps[ui.activeIndex];
    view.stepperSteps = steps.map((step, index) => {
      const current = index === ui.activeIndex;
      const reached = index <= ui.highwater;
      return {
        id: step.id,
        index,
        title: step.title,
        state: current ? "active" : reached ? "completed" : "pending",
        disabled: !reached,
        ariaCurrent: current ? "step" : null,
      };
    });
  }

  function selectStep(index) {
    if (index < 0 || index > ui.highwater) return;
    ui.activeIndex = index;
    syncNav();
  }

  function resetToStep(index = 1) {
    const target = index >= 0 && index < steps.length ? index : 0;
    ui.activeIndex = target;
    ui.highwater = Math.max(ui.highwater, target);
    getView().navDir = null;
    syncNav();
  }

  function resetToStyle() {
    resetToStep(Math.max(0, steps.findIndex((step) => step.id === "style")));
  }

  function next() {
    const index = Math.min(ui.activeIndex + 1, steps.length - 1);
    if (index === ui.activeIndex) return;
    getView().navDir = "next";
    ui.activeIndex = index;
    ui.highwater = Math.max(ui.highwater, ui.activeIndex);
    syncNav();
  }

  function prev() {
    const index = Math.max(ui.activeIndex - 1, 0);
    if (index === ui.activeIndex) return;
    getView().navDir = "prev";
    ui.activeIndex = index;
    syncNav();
  }

  function keyNav(direction, event) {
    if (!isEditorActive()) return;
    const el = event?.target;
    if (el?.closest?.("input, select, textarea")) return;
    if (direction === "prev") prev();
    else next();
  }

  return { syncNav, selectStep, resetToStep, resetToStyle, next, prev, keyNav };
}

export const KEYS = ["syncNav", "selectStep", "resetToStep", "resetToStyle", "next", "prev", "keyNav"];
