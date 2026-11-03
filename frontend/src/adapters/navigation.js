// Step navigation: keeps the app's visible rail in sync with the UI store and
// mirrors the rail with keyboard/button navigation.

export function installNavigation(app, { ui, steps, isEditorActive = () => true }) {
  Object.assign(app, {
    syncNav() {
      this.activeIndex = ui.activeIndex;
      this.highwater = ui.highwater;
      this.activeStep = steps[ui.activeIndex];
      this.visibleSteps = steps
        .slice(0, ui.highwater + 1)
        .map((s, i) => ({ ...s, index: i, active: i === ui.activeIndex, complete: i < ui.activeIndex }));
    },

    selectStep(index) {
      if (index < 0 || index > ui.highwater) return;
      ui.activeIndex = index;
      this.syncNav();
    },

    resetToStep(index = 1) {
      const target = index >= 0 && index < steps.length ? index : 0;
      ui.activeIndex = target;
      ui.highwater = Math.max(ui.highwater, target);
      this.navDir = null;
      this.syncNav();
    },

    // Every batch opens on Style: the identity is sealed, the targets are the
    // first thing the brewer parameterises.
    resetToStyle() {
      this.resetToStep(Math.max(0, steps.findIndex((step) => step.id === "style")));
    },

    next() {
      const index = Math.min(ui.activeIndex + 1, steps.length - 1);
      if (index === ui.activeIndex) return;
      this.navDir = "next";
      ui.activeIndex = index;
      ui.highwater = Math.max(ui.highwater, ui.activeIndex);
      this.syncNav();
    },

    prev() {
      const index = Math.max(ui.activeIndex - 1, 0);
      if (index === ui.activeIndex) return;
      this.navDir = "prev";
      ui.activeIndex = index;
      this.syncNav();
    },

    // Keyboard mirror of the up/down rail (arrows + page up/down). Ignored while
    // focus is in a form control so it doesn't hijack arrow keys.
    keyNav(direction, event) {
      if (!isEditorActive()) return;
      const el = event?.target;
      if (el?.closest?.("input, select, textarea")) return;
      if (direction === "prev") this.prev();
      else this.next();
    },
  });
}

export const KEYS = ["syncNav", "selectStep", "resetToStep", "resetToStyle", "next", "prev", "keyNav"];
