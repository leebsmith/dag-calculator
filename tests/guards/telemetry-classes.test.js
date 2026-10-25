import test from "node:test";
import assert from "node:assert/strict";

import { createTestApp } from "../frontend/appHelpers.js";
import { read } from "./util.js";

test("telemetry severity classes exist in the stylesheet", async () => {
  const app = createTestApp();
  await app.boot();
  const css = read("frontend/src/style.css");

  for (const severity of ["INFO", "WARNING", "ERROR", "NOTE"]) {
    const className = app.telemetryClass({ severity });
    assert.equal(className, `sev-${severity.toLowerCase()}`);
    assert.match(css, new RegExp(`\\.${className}\\b`), className);
  }
});
