import test from "node:test";
import assert from "node:assert/strict";
import { walk, read, rel } from "./util.js";
import { createStepApp } from "../../frontend/src/adapters/stepAdapter.js";

// A8a: unit conversion is display-only — `units.fromBase` is referenced only by
// the producer (and the units module itself).
test("A8a: units.fromBase used only by the producer", () => {
  const offenders = [];
  for (const abs of walk("frontend/src", [".js"])) {
    const r = rel(abs);
    if (
      r.endsWith("views/producer.js") ||
      r.endsWith("engine/units.js") ||
      r.endsWith("engine/index.js")
    ) {
      continue;
    }
    read(r)
      .split("\n")
      .forEach((line, i) => {
        if (/fromBase/.test(line)) offenders.push(`${r}:${i + 1}: ${line.trim()}`);
      });
  }
  assert.deepEqual(offenders, [], offenders.join("\n"));
});

// A8b: unit mode converts the DISPLAY, but writes to the store stay in base units.
test("A8b: unit mode converts display; writes store base", () => {
  const app = createStepApp();
  app.init();
  app.setUnit("temperature", "degF");

  const strike = app.fieldsBySlice.mash.find((f) => f.id === "mash.strike_water_temp_c");
  assert.ok(Math.abs(strike.value - 76.4447619047619) < 1e-6, "canonical value stays base (°C)");
  assert.ok(
    Math.abs(Number(strike.display) - (76.4447619047619 * 1.8 + 32)) < 0.01,
    "display converts to °F"
  );

  app.edit(app.fieldsBySlice.mash.find((f) => f.id === "mash.grain_temp_c"), "25");
  assert.equal(app.master.getRoot("mash.grain_temp_c"), 25, "write stores the base value");
});
