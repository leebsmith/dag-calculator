import test from "node:test";
import assert from "node:assert/strict";

import {
  SHAPE_RULES,
  actuals,
  declaredPins,
  measure,
  pinDrift,
} from "../../scripts/shape-pins.mjs";

test("a pin equals the count the linter reports for its file", () => {
  const pins = declaredPins();
  assert.ok(Object.keys(pins).length > 0, "no shape pins found — did the config names change?");
  const drift = pinDrift(pins, measure(pins));
  assert.deepEqual(
    drift.map(
      ({ file, rule, pin, actual, kind }) =>
        `${file} ${rule}: pinned ${pin}, actual ${actual} (${kind === "over" ? "raise or split" : "lower the pin"})`
    ),
    [],
    "shape pins describe the file as it is; lower the pin in the same commit that improves it"
  );
});

test("every pin names a rule the shape contract enforces", () => {
  for (const [file, rules] of Object.entries(declaredPins())) {
    for (const rule of Object.keys(rules)) {
      assert.ok(SHAPE_RULES.includes(rule), `${file} pins unknown rule ${rule}`);
    }
  }
});

test("a reported count is read from the linter message, not the ceiling", () => {
  const messages = [
    { ruleId: "complexity", message: "Function 'x' has a complexity of 93. Maximum allowed is 1." },
    { ruleId: "max-lines", message: "File has too many lines (639). Maximum allowed is 1." },
    { ruleId: "max-params", message: "Function 'y' has too many parameters (6). Maximum allowed is 1." },
    { ruleId: "max-depth", message: "Blocks are nested too deeply (5). Maximum allowed is 1." },
    { ruleId: "no-undef", message: "'x' is not defined." },
  ];
  assert.deepEqual(actuals(messages), {
    complexity: 93,
    "max-lines": 639,
    "max-params": 6,
    "max-depth": 5,
  });
});
