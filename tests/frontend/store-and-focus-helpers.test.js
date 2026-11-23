import test from "node:test";
import assert from "node:assert/strict";

import { modalShell } from "../../frontend/src/components/modalShell.js";
import { createModalFocusManager } from "../../frontend/src/adapters/modalFocus.js";
import { createImportReviewStore } from "../../frontend/src/store/importReview.js";

function section(rows) {
  return { id: "hops", rows };
}

test("sectionRowCount finds the section and tolerates a missing one", () => {
  const store = createImportReviewStore({ client: {} });
  const context = { sections: [section([{}, {}])] };

  assert.equal(store.sectionRowCount.call(context, "hops"), 2);
  assert.equal(store.sectionRowCount.call(context, "yeast"), 0);
});

test("decidedLabel counts mapped and ignored rows only", () => {
  const store = createImportReviewStore({ client: {} });
  const rows = [{ decision: "mapped" }, { decision: "ignored" }, { decision: "undecided" }];

  assert.equal(store.decidedLabel(section(rows)), "(2 of 3)");
  assert.equal(store.decidedLabel(section([])), "(0 of 0)");
});

test("focusRef focuses the named ref only while open", () => {
  const calls = [];
  const context = {
    $nextTick: (callback) => callback(),
    $refs: { keep: { focus: () => calls.push("focus") } },
  };
  const { focusRef } = modalShell({ id: "probe" });

  focusRef.call(context, false, "keep");
  assert.deepEqual(calls, []);
  focusRef.call(context, true, "keep");
  assert.deepEqual(calls, ["focus"]);
  focusRef.call(context, true, "missing");
  assert.deepEqual(calls, ["focus"]);
});

test("focusAndSelect focuses and selects the element", () => {
  const calls = [];
  const { focusAndSelect } = createModalFocusManager({ document: null });
  const element = {
    focus: () => calls.push("focus"),
    select: () => calls.push("select"),
  };

  focusAndSelect(element);
  focusAndSelect(null);
  assert.deepEqual(calls, ["focus", "select"]);
});
