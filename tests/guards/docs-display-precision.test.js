import test from "node:test";
import assert from "node:assert/strict";

import {
  DIMENSION_DECIMALS,
  unitDecimals,
} from "../../frontend/src/views/registry/units.js";
import { read } from "./util.js";

// docs/display-precision.md restates the decimal policy that `units.js`
// implements. Nothing else compares the two, so a digit edited in one place is
// otherwise invisible.

function dimensionRows() {
  const text = read("docs/display-precision.md");
  const section = text.split(/^## /m).find((part) => part.startsWith("Dimensions"));
  assert.ok(section, "docs/display-precision.md has no `## Dimensions` section");
  return section
    .split("\n")
    .filter((line) => line.startsWith("|"))
    .slice(2)
    .map((line) => {
      const cells = line
        .split("|")
        .slice(1, -1)
        .map((cell) => cell.trim().replaceAll("`", ""));
      return { dimension: cells[0], precision: cells[1] };
    });
}

function parsePrecision(dimension, precision) {
  if (/^\d+$/.test(precision)) return [{ unit: null, decimals: Number(precision) }];
  return precision
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const match = part.match(/^([A-Za-z0-9_]+)\s+(\d+)$/);
      assert.ok(match, `unparsable precision "${part}" for ${dimension}`);
      return { unit: match[1], decimals: Number(match[2]) };
    });
}

test("the precision table matches the dimension policy", () => {
  const problems = [];
  for (const { dimension, precision } of dimensionRows()) {
    if (dimension.includes(",") || dimension === "dimensionless") continue;
    for (const { unit, decimals } of parsePrecision(dimension, precision)) {
      const actual = unit === null ? DIMENSION_DECIMALS[dimension] : unitDecimals(dimension, unit);
      if (actual !== decimals) {
        problems.push(
          `${dimension}${unit ? ` ${unit}` : ""}: doc ${decimals}, units.js ${actual ?? "missing"}`
        );
      }
    }
  }
  assert.deepEqual(problems, [], `display-precision drift:\n${problems.join("\n")}`);
});

test("every dimension with a decimal policy is in the table", () => {
  const listed = new Set(
    dimensionRows()
      .filter(({ dimension }) => !dimension.includes(",") && dimension !== "dimensionless")
      .map(({ dimension }) => dimension)
  );
  const missing = Object.keys(DIMENSION_DECIMALS).filter((dimension) => !listed.has(dimension));
  assert.deepEqual(
    missing,
    [],
    `dimensions with a decimal policy but no display-precision row: ${missing.join(", ")}`
  );
});
