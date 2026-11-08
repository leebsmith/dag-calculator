// The shell exposes its header state as getters over the configured props.
// Spreading that getter object into a plain literal invokes it once, freezing
// `saveDisabledState` and friends at construction; the live read is the contract.

import test from "node:test";
import assert from "node:assert/strict";

import { modalShell } from "../../frontend/src/components/modalShell.js";
import { alpineReactiveValue } from "./alpineProxy.js";

test("header getters stay live after Alpine wraps the shell", async () => {
  let busy = false;
  let title = "New batch";
  const shell = await alpineReactiveValue(
    modalShell({
      id: "new-batch",
      title: () => title,
      cancel: () => {},
      saveDisabled: () => busy,
    })
  );

  assert.equal(shell.saveDisabledState, false);
  assert.equal(shell.titleText, "New batch");

  busy = true;
  title = "Busy batch";

  assert.equal(shell.saveDisabledState, true);
  assert.equal(shell.titleText, "Busy batch");
});

test("cancelShown reports the callback without invoking it", async () => {
  let calls = 0;
  const shell = await alpineReactiveValue(
    modalShell({ id: "new-batch", cancel: () => (calls += 1) })
  );

  assert.equal(shell.cancelShown, true);
  assert.equal(calls, 0);

  const bare = await alpineReactiveValue(modalShell({ id: "report-picker" }));

  assert.equal(bare.cancelShown, false);
});

test("syncOpen writes the instance's own open state", async () => {
  const shell = await alpineReactiveValue(modalShell({ id: "new-batch" }));

  assert.equal(shell.isOpen, false);
  shell.syncOpen("yes");
  assert.equal(shell.isOpen, true);
  shell.syncOpen(0);
  assert.equal(shell.isOpen, false);
});
