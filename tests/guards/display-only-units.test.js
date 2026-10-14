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

  // The input renders in °F, so a typed 68 is converted back to base (°C).
  app.edit(app.fieldsBySlice.mash.find((f) => f.id === "mash.grain_temp_c"), "68");
  assert.equal(app.master.getRoot("mash.grain_temp_c"), 20, "write converts display unit -> base");
});

// A8c: per-field unit overrides win over the dimension default and drop cleanly
// when toggled back to the default. The `customized` accent marks a pill when a
// per-field override is in play OR the effective unit is not the field's natural
// default (base unit here, °C) — so a dimension-level pick is accented too.
test("A8c: per-field unit override", () => {
  const app = createStepApp();
  app.init();
  const grain = () => app.fieldsBySlice.mash.find((f) => f.id === "mash.grain_temp_c");

  app.setUnit("temperature", "degF");
  assert.equal(grain().unitId, "degF");
  assert.equal(grain().customized, true, "dimension-level pick is non-default");

  app.toggleFieldUnit(grain());
  assert.equal(grain().unitId, "degC");
  assert.equal(grain().customized, true, "a per-field override is accented even at the base unit");
  assert.equal(Number(grain().display), 20, "overridden field displays in its own unit");

  // sibling temperature field still follows the dimension default
  const strike = app.fieldsBySlice.mash.find((f) => f.id === "mash.strike_water_temp_c");
  assert.equal(strike.unitId, "degF");
  assert.equal(strike.customized, true);

  app.toggleFieldUnit(grain());
  assert.equal(grain().unitId, "degF");
  assert.equal(grain().customized, true, "back on the dimension default (still non-base)");
  assert.equal("mash.grain_temp_c" in app.unitMode, false, "field override dropped cleanly");
});

// A8d: a registry `displayUnit` defaults the readout to that unit while the
// canonical value stays in the base unit (kg/L), with no override recorded.
test("A8d: registry displayUnit defaults the display (g/ml)", () => {
  const app = createStepApp();
  app.init();

  const gypsum = app.fieldsBySlice.water.find((f) => f.id === "solver.water.mash_additions.gypsum_kg");
  assert.equal(gypsum.value, 0.002, "canonical value stays kg");
  assert.equal(gypsum.display, "2", "displays in grams by default");
  assert.equal(gypsum.unit, "g");
  assert.equal(gypsum.customized, false);

  const acid = app.fieldsBySlice.water.find((f) => f.id === "solver.water.mash_additions.acid_l");
  assert.equal(acid.value, 0.0005, "canonical value stays L");
  assert.equal(acid.display, "0.5", "displays in millilitres by default");
  assert.equal(acid.unit, "mL");
  assert.equal(acid.customized, false);
});

// A8e: a collection column with a `displayUnit` renders in that unit, and the
// write stores the base value (cell conversion for collection tables).
test("A8e: collection cell displayUnit converts display; write stores base", () => {
  const app = createStepApp();
  app.init();
  const table = () => app.fieldsBySlice["dry-hops"].find((f) => f.control === "collection-table");

  app.addRow(table());
  app.editCell(table(), 0, "contact_duration_hours", "48");

  assert.equal(table().rows[0].contact_duration_hours, 48, "cell displays in hours");
  assert.equal(
    app.draftState().collections["batch.dry_hops"][0].contact_duration_hours,
    2880,
    "canonical value is stored in base minutes (48 hr)"
  );
});
