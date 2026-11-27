import test from "node:test";
import assert from "node:assert/strict";

import { createWallActions, nearestChip } from "../../frontend/src/adapters/wall.js";

const FIELDSETS = [
  { id: "targets", title: "Targets", width: "full" },
  { id: "yeast", title: "Yeast", width: "narrow" },
  { id: "grist", title: "Grist", width: "wide" },
];

function section(id, { top = 0, control = null, heading = null } = {}) {
  return {
    top,
    scrolled: [],
    getBoundingClientRect() {
      return { top: this.top };
    },
    scrollIntoView(options) {
      this.scrolled.push(options);
    },
    querySelector(selector) {
      return selector.includes("input") ? control : heading;
    },
  };
}

function focusable(log, name) {
  return {
    tabIndex: null,
    focus(options) {
      log.push([name, options]);
    },
  };
}

function install({ sections, schedule = (fn) => fn } = {}) {
  const documentRef = {
    querySelector(selector) {
      const id = /\[data-fieldset="([^"]+)"\]/.exec(selector)?.[1];
      return sections[id] ?? null;
    },
  };
  let clock = 0;
  const view = {};
  const actions = createWallActions({
    fieldsets: FIELDSETS,
    getView: () => view,
    documentRef,
    now: () => clock,
    schedule,
  });
  return {
    actions,
    view,
    advance(ms) {
      clock += ms;
    },
  };
}

test("nearestChip is the last section at or above the fold", () => {
  assert.equal(nearestChip(["a", "b", "c"], [0, 100, 200], { top: 50 }), "a");
  assert.equal(nearestChip(["a", "b", "c"], [0, 100, 200], { top: 100 }), "b");
  assert.equal(nearestChip(["a", "b", "c"], [0, 100, 200], { top: -40 }), "a");
  assert.equal(nearestChip(["a", "b", "c"], [0, 100, 200], { top: 50, atEnd: true }), "c");
  assert.equal(nearestChip([], [], { top: 0 }), null);
});

test("the chips mirror the fieldset manifest", () => {
  const { actions } = install({ sections: {} });

  assert.deepEqual(actions.wallChips, FIELDSETS);
  assert.equal(actions.activeChipId, "targets");
  assert.equal(actions.landingFieldset, null);
});

test("selecting a chip scrolls, focuses the first control and cues the landing", () => {
  const log = [];
  const control = focusable(log, "control");
  const target = section("yeast", { control });
  const { actions, view } = install({ sections: { yeast: target } });

  actions.selectFieldset("yeast");

  assert.equal(view.activeChipId, "yeast");
  assert.equal(view.landingFieldset, "yeast");
  assert.deepEqual(target.scrolled, [{ behavior: "smooth", block: "start" }]);
  assert.equal(log.length, 1);
  assert.equal(log[0][0], "control");
  assert.deepEqual(log[0][1], { preventScroll: true });
});

test("a read-only fieldset focuses its heading with a programmatic tab stop", () => {
  const log = [];
  const heading = focusable(log, "heading");
  const { actions } = install({ sections: { grist: section("grist", { heading }) } });

  actions.selectFieldset("grist");

  assert.equal(heading.tabIndex, -1);
  assert.deepEqual(log, [["heading", { preventScroll: true }]]);
});

test("the landing cue clears on the scheduled tick", () => {
  const queued = [];
  const { actions, view } = install({
    sections: { targets: section("targets", { control: focusable([], "control") }) },
    schedule: (fn) => queued.push(fn),
  });

  actions.selectFieldset("targets");
  assert.equal(view.landingFieldset, "targets");

  queued.at(-1)();
  assert.equal(view.landingFieldset, null);
});

test("an unknown chip and a missing section change nothing", () => {
  const { actions, view } = install({ sections: {} });

  actions.selectFieldset("nowhere");
  assert.deepEqual(view, {});

  actions.selectFieldset("targets");
  assert.deepEqual(view, { activeChipId: "targets" });
});

test("the scroll spy follows the sections and defers to a programmatic scroll", () => {
  const sections = {
    targets: section("targets", { top: -160 }),
    yeast: section("yeast", { top: 40 }),
    grist: section("grist", { top: 380 }),
  };
  const wall = {
    scrollTop: 200,
    clientHeight: 400,
    scrollHeight: 2000,
    getBoundingClientRect: () => ({ top: 0 }),
  };
  const { actions, view, advance } = install({ sections });

  actions.wallScrolled({ currentTarget: wall });
  assert.equal(view.activeChipId, "yeast");

  actions.selectFieldset("grist");
  advance(100);
  view.activeChipId = "grist";
  actions.wallScrolled({ currentTarget: wall });
  assert.equal(view.activeChipId, "grist", "the spy is suppressed after a chip click");

  advance(1000);
  actions.wallScrolled({ currentTarget: wall });
  assert.equal(view.activeChipId, "yeast");
});

test("the last chip wins at the bottom of the scroll region", () => {
  const sections = {
    targets: section("targets", { top: -600 }),
    yeast: section("yeast", { top: -300 }),
    grist: section("grist", { top: 30 }),
  };
  const wall = {
    scrollTop: 1600,
    clientHeight: 400,
    scrollHeight: 2000,
    getBoundingClientRect: () => ({ top: 0 }),
  };
  const { actions, view } = install({ sections });

  actions.wallScrolled({ currentTarget: wall });
  assert.equal(view.activeChipId, "grist");
});
