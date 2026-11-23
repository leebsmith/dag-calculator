import test from "node:test";
import assert from "node:assert/strict";

import { tableConfig } from "../../frontend/src/components/tableConfig.js";

function withScope(scope, run) {
  const previous = globalThis.Alpine;
  globalThis.Alpine = { $data: () => scope };
  try {
    return run();
  } finally {
    globalThis.Alpine = previous;
  }
}

test("the table config resolves from the data attribute", () => {
  const scope = { gristTableConfig: () => ({ variant: "editor", dense: true }) };
  const component = tableConfig();

  withScope(scope, () => {
    component.$el = { dataset: { config: "gristTableConfig" }, parentElement: {} };
    component.init();
  });

  assert.deepEqual(component.config, { variant: "editor", dense: true });
});

test("an explicit config wins and no attribute lookup happens", () => {
  const config = { variant: "readout" };
  let looked = false;
  const previous = globalThis.Alpine;
  globalThis.Alpine = {
    $data: () => {
      looked = true;
      return {};
    },
  };
  try {
    const component = tableConfig(config);
    component.$el = { dataset: { config: "ignored" }, parentElement: {} };
    component.init();
    assert.equal(component.config, config);
    assert.equal(looked, false);
  } finally {
    globalThis.Alpine = previous;
  }
});
