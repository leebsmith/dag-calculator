import test from "node:test";
import assert from "node:assert/strict";

import {
  clamp,
  formatValue,
  formatWithDecimals,
  isFiniteNumber,
  roundTo,
  toFiniteOrNull,
} from "../../frontend/src/utils/format/number.js";
import {
  formatPercent,
  formatPercentRange,
  formatPercentRounded,
  formatPercentValue,
  toPercentValue,
} from "../../frontend/src/utils/format/percent.js";
import {
  bitternessRatio,
  formatGravity,
  formatGravityRange,
  gravityUnits,
} from "../../frontend/src/utils/format/gravity.js";
import { formatRange } from "../../frontend/src/utils/format/range.js";
import {
  formatColumnHeader,
  formatFieldLabel,
  formatQuantity,
  formatValueWithUnit,
} from "../../frontend/src/utils/format/units.js";
import { countLabel, resultCounter } from "../../frontend/src/utils/format/count.js";
import { displayOrDash, safeHref } from "../../frontend/src/utils/format/text.js";
import { formatDate } from "../../frontend/src/utils/format/time.js";
import { firstNonEmptyString } from "../../frontend/src/utils/strings.js";
import * as barrel from "../../frontend/src/utils.js";

const near = (actual, expected, epsilon = 1e-9) => {
  assert.ok(Math.abs(actual - expected) < epsilon, `${actual} !~ ${expected}`);
};

test("formatValue keeps integers and trims other numbers to 3dp", () => {
  assert.equal(formatValue(4), "4");
  assert.equal(formatValue(1.23456), "1.235");
  assert.equal(formatValue(-0.5), "-0.5");
  assert.equal(formatValue("abc"), "abc");
  assert.equal(formatValue(null), "");
  assert.equal(formatValue(undefined), "");
  assert.equal(formatValue(Number.NaN), "");
  assert.equal(formatValue(Number.POSITIVE_INFINITY), "");
});

test("formatWithDecimals honors decimals and the dash fallback", () => {
  assert.equal(formatWithDecimals(1.2345, 2), "1.23");
  assert.equal(formatWithDecimals(80, 1), "80.0");
  assert.equal(formatWithDecimals(1.23456, null), "1.235");
  assert.equal(formatWithDecimals(null, 2), "");
  assert.equal(formatWithDecimals(null, 2, { dash: "—" }), "—");
  assert.equal(formatWithDecimals("1.5", 2), "1.50");
  assert.equal(formatWithDecimals(1.5, "2"), "1.50");
  assert.equal(formatWithDecimals(1.5, 500), "1.50000000000000000000");
});

test("roundTo clamps decimals and rejects non-numeric input", () => {
  assert.equal(roundTo(1.005, 2), 1);
  assert.equal(roundTo(1.23456, 3), 1.235);
  assert.equal(roundTo(1.5, -4), 2);
  assert.equal(roundTo("nope"), null);
  assert.equal(roundTo(null), null);
});

test("toFiniteOrNull coerces numeric strings only", () => {
  assert.equal(toFiniteOrNull(0), 0);
  assert.equal(toFiniteOrNull(" 12.5 "), 12.5);
  assert.equal(toFiniteOrNull(""), null);
  assert.equal(toFiniteOrNull("   "), null);
  assert.equal(toFiniteOrNull("abc"), null);
  assert.equal(toFiniteOrNull(true), null);
  assert.equal(toFiniteOrNull(null), null);
  assert.equal(toFiniteOrNull([]), null);
});

test("isFiniteNumber accepts only real numbers", () => {
  assert.equal(isFiniteNumber(0), true);
  assert.equal(isFiniteNumber(-1.5), true);
  assert.equal(isFiniteNumber("1"), false);
  assert.equal(isFiniteNumber(Number.NaN), false);
  assert.equal(isFiniteNumber(Number.POSITIVE_INFINITY), false);
});

test("formatPercent treats its input as a 0..1 fraction", () => {
  assert.equal(formatPercent(0.755), "75.5%");
  assert.equal(formatPercent("0.5"), "50.0%");
  assert.equal(formatPercent(0.755, 0), "76%");
  assert.equal(formatPercent(null), "—");
  assert.equal(formatPercent(null, 1, { dash: "" }), "");
});

test("formatPercentRounded and formatPercentValue differ by contract", () => {
  assert.equal(formatPercentRounded(0.756), "76%");
  assert.equal(formatPercentRounded(undefined), "—");
  assert.equal(formatPercentValue(5.4), "5.4%");
  assert.equal(formatPercentValue(null), "—");
});

test("toPercentValue returns a percent number for input bindings", () => {
  assert.equal(toPercentValue(0.8, 0), 80);
  assert.equal(toPercentValue(0.755, 1), 75.5);
  assert.equal(toPercentValue(null), "");
  near(toPercentValue(0.12345, 2), 12.35, 1e-9);
});

test("formatGravity formats specific gravity", () => {
  assert.equal(formatGravity(1.054), "1.054");
  assert.equal(formatGravity(1.05, 2), "1.05");
  assert.equal(formatGravity(null), "");
});

test("formatRange and formatGravityRange degrade gracefully", () => {
  assert.equal(formatGravityRange(1.04, 1.055), "1.040–1.055");
  assert.equal(formatRange(1, 2), "1–2");
  assert.equal(formatRange(null, 2), "2");
  assert.equal(formatRange(1, null), "1");
  assert.equal(formatRange(null, null), "—");
  assert.equal(formatRange(null, null, null, { dash: "" }), "");
  assert.equal(formatRange(1, 2, (v) => `x${v}`), "x1–x2");
});

test("formatPercentRange shares one suffix and collapses equal ends", () => {
  assert.equal(formatPercentRange(0.053, 0.062), "5.3–6.2%");
  assert.equal(formatPercentRange(0.053, 0.053), "5.3%");
  assert.equal(formatPercentRange(0.0526, 0.0531), "5.3%");
  assert.equal(formatPercentRange(0.1, 1), "10.0–100.0%");
  assert.equal(formatPercentRange(0.053, 0.062, { decimals: 0 }), "5–6%");
  assert.equal(formatPercentRange(null, 0.062), "6.2%");
  assert.equal(formatPercentRange(0.053, null), "5.3%");
  assert.equal(formatPercentRange(null, null), "—");
  assert.equal(formatPercentRange(null, null, { dash: "" }), "");
});

test("formatValueWithUnit joins units and keeps percent tight", () => {
  assert.equal(formatValueWithUnit(12.3, "EBC"), "12.3 EBC");
  assert.equal(formatValueWithUnit(80, "%"), "80%");
  assert.equal(formatValueWithUnit(12.3, undefined), "12.3");
  assert.equal(formatValueWithUnit(12.3, undefined, { fallbackUnit: "IBU" }), "12.3 IBU");
  assert.equal(formatValueWithUnit(null, "EBC"), "—");
  assert.equal(formatValueWithUnit(null, "EBC", { dash: "" }), "");
  assert.equal(formatValueWithUnit(1, "kg", { tightUnits: ["kg"] }), "1kg");
});

test("formatQuantity renders producer field models", () => {
  assert.equal(formatQuantity({ display: "12.3", unit: "EBC" }), "12.3 EBC");
  assert.equal(formatQuantity({ display: "80", unit: "%" }), "80%");
  assert.equal(formatQuantity({ display: "", unit: "EBC" }), "—");
  assert.equal(formatQuantity({ value: 0, unit: "kg" }), "0 kg");
  assert.equal(formatQuantity(null), "—");
  assert.equal(formatQuantity({ display: "4.2" }, { fallbackUnit: "IBU" }), "4.2 IBU");
});

test("label helpers compose one canonical header string", () => {
  assert.equal(formatColumnHeader({ label: "Mass", unit: "kg" }), "Mass (kg)");
  assert.equal(formatColumnHeader({ label: "Name" }), "Name");
  assert.equal(formatColumnHeader({ id: "mass_kg" }), "mass_kg");
  assert.equal(formatColumnHeader(null), "");
  assert.equal(formatColumnHeader({ label: "  ", unit: "  " }), "");
  assert.equal(formatFieldLabel("Color", "EBC"), "Color (EBC)");
  assert.equal(formatFieldLabel("Color", null), "Color");
  assert.equal(firstNonEmptyString("", null, " a ", 4), "a");
  assert.equal(firstNonEmptyString(null, undefined, 0), "0");
  assert.equal(firstNonEmptyString(null, undefined), "");
});

test("countLabel pluralizes explicitly and safely", () => {
  assert.equal(countLabel(1, "malt"), "1 malt");
  assert.equal(countLabel(2, "malt"), "2 malts");
  assert.equal(countLabel(0, "hop", "hops"), "0 hops");
  assert.equal(countLabel(null, "malt"), "");
  assert.equal(countLabel(1, ""), "1 item");
});

test("resultCounter builds the catalog sentence", () => {
  assert.equal(
    resultCounter({ total: 12, noun: "matching style" }),
    "Showing 12 matching styles"
  );
  assert.equal(
    resultCounter({
      shown: 25,
      total: 40,
      noun: "matching style",
      truncated: true,
      truncatedHint: "refine search",
    }),
    "Showing 25 of 40 matching styles — refine search"
  );
  assert.equal(resultCounter({ total: 1, noun: "matching style" }), "Showing 1 matching style");
  assert.equal(resultCounter({ total: null }), "");
});

test("displayOrDash normalizes blanks", () => {
  assert.equal(displayOrDash("  "), "—");
  assert.equal(displayOrDash(null), "—");
  assert.equal(displayOrDash(0), "0");
  assert.equal(displayOrDash("", "n/a"), "n/a");
});

test("clamp ignores null bounds and rejects non-numbers", () => {
  assert.equal(clamp(5, 1, 3), 3);
  assert.equal(clamp(-5, 1, 3), 1);
  assert.equal(clamp(2, null, null), 2);
  assert.equal(clamp("2.5", 0, 10), 2.5);
  assert.equal(clamp("nope", 0, 10), null);
});

test("gravity math", () => {
  near(gravityUnits(1.054), 54, 1e-9);
  assert.equal(gravityUnits(null), null);
  near(bitternessRatio(30, 1.054), 30 / 54, 1e-12);
  assert.equal(bitternessRatio(30, 1), null);
  assert.equal(bitternessRatio(null, 1.05), null);
});

test("safeHref allows only http(s) schemes", () => {
  assert.equal(safeHref("https://example.com/strain"), "https://example.com/strain");
  assert.equal(safeHref("http://example.com"), "http://example.com");
  assert.equal(safeHref("  https://example.com  "), "https://example.com");
  assert.equal(safeHref("javascript:alert(1)"), "");
  assert.equal(safeHref("data:text/html,<script>"), "");
  assert.equal(safeHref("vbscript:msgbox"), "");
  assert.equal(safeHref("relative/path"), "");
  assert.equal(safeHref("//example.com"), "");
  assert.equal(safeHref(""), "");
  assert.equal(safeHref("   "), "");
  assert.equal(safeHref(123), "");
  assert.equal(safeHref(null), "");
});

test("formatDate renders a short date or a dash", () => {
  assert.equal(formatDate(null), "—");
  assert.equal(formatDate(Number.NaN), "—");
  assert.equal(
    formatDate(Date.UTC(2026, 9, 21, 12) / 1000, { locale: "en-US", timeZone: "UTC" }),
    "Oct 21, 2026"
  );
  assert.equal(formatDate(Date.UTC(2026, 9, 21, 12) / 1000, { locale: "not-a-locale" }).length > 0, true);
});

test("the barrel still exports every formatter", () => {
  for (const name of [
    "clamp",
    "countLabel",
    "displayOrDash",
    "formatColumnHeader",
    "formatDate",
    "formatFieldLabel",
    "formatGravity",
    "formatGravityRange",
    "formatPercent",
    "formatPercentRange",
    "formatPercentRounded",
    "formatPercentValue",
    "formatQuantity",
    "formatRange",
    "formatValue",
    "formatValueWithUnit",
    "formatWithDecimals",
    "gravityUnits",
    "resultCounter",
    "roundTo",
    "safeHref",
    "toFiniteOrNull",
    "toPercentValue",
  ]) {
    assert.equal(typeof barrel[name], "function", `utils.js re-exports ${name}`);
  }
});
