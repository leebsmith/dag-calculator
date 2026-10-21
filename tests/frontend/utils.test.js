import test from "node:test";
import assert from "node:assert/strict";

import {
  EMPTY_FIELD,
  bitternessRatio,
  boundsOf,
  cellKind,
  clamp,
  countLabel,
  cycleUnit,
  displayOrDash,
  fieldOr,
  firstNonEmptyString,
  formatColumnHeader,
  formatDate,
  formatFieldLabel,
  formatGravity,
  formatGravityRange,
  formatPercent,
  formatPercentRounded,
  formatPercentValue,
  formatQuantity,
  formatRange,
  formatValue,
  formatValueWithUnit,
  formatWithDecimals,
  gravityUnits,
  hasInvalidCells,
  hasMissingNumber,
  indexFields,
  isRepresentative,
  joinNonEmpty,
  preferredUnit,
  provenanceFor,
  resultCounter,
  roundTo,
  toFiniteOrNull,
  toPercentValue,
  toggleFilter,
  toggleInList,
  unitSymbol,
} from "../../frontend/src/utils.js";

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

test("joinNonEmpty suppresses empty separators", () => {
  assert.equal(joinNonEmpty(["a", null, "", "b"]), "a • b");
  assert.equal(joinNonEmpty(["a", "b"], " · "), "a · b");
  assert.equal(joinNonEmpty([null, undefined, ""]), "");
  assert.equal(joinNonEmpty("nope"), "");
  assert.equal(joinNonEmpty([0, 1]), "0 • 1");
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

test("filter helpers never mutate their input", () => {
  assert.equal(toggleFilter("a", "a"), "");
  assert.equal(toggleFilter("a", "b"), "b");
  assert.equal(toggleFilter("a", ""), "");
  const list = ["a"];
  const added = toggleInList(list, "b");
  assert.deepEqual(added, ["a", "b"]);
  assert.deepEqual(list, ["a"]);
  assert.deepEqual(toggleInList(added, "a"), ["b"]);
  assert.deepEqual(toggleInList(null, "a"), ["a"]);
});

test("cycleUnit wraps and tolerates unknown ids", () => {
  assert.equal(cycleUnit(["oz", "g"], "oz"), "g");
  assert.equal(cycleUnit(["oz", "g"], "g"), "oz");
  assert.equal(cycleUnit(["oz", "g"], "kg"), "oz");
  assert.equal(cycleUnit([], "oz"), "oz");
  assert.equal(cycleUnit(null, null), null);
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

test("indexFields and fieldOr are O(1) and non-throwing", () => {
  const a = { id: "a", label: "A" };
  const b = { id: "b", label: "B" };
  const index = indexFields([a, null, b, { id: "a", label: "dup" }]);
  assert.equal(index.a, a);
  assert.equal(index.b, b);
  assert.deepEqual(indexFields(null), {});
  assert.equal(fieldOr(index, "a"), a);
  assert.equal(fieldOr(index, "missing"), EMPTY_FIELD);
  assert.equal(fieldOr(null, "a"), EMPTY_FIELD);
  assert.equal(fieldOr(index, null), EMPTY_FIELD);
  assert.equal(fieldOr(index, "toString"), EMPTY_FIELD);
});

test("boundsOf requires a strictly ordered pair", () => {
  const fields = [
    { id: "min", value: 5 },
    { id: "max", value: 10 },
  ];
  assert.deepEqual(boundsOf(fields, "min", "max"), [5, 10]);
  assert.equal(boundsOf(fields, "min", "min"), null);
  assert.equal(boundsOf(fields, "min", "missing"), null);
  assert.equal(boundsOf(null, "min", "max"), null);
  assert.deepEqual(boundsOf(indexFields(fields), "min", "max"), [5, 10]);
});

test("provenanceFor derives the seed badge and reset affordance", () => {
  const seeded = provenanceFor({ seeded: true, seededSource: "style" });
  assert.equal(seeded.showSeed, true);
  assert.equal(seeded.showReset, false);
  assert.match(seeded.seedTitle, /Auto-filled from style/);

  const overridden = provenanceFor({ seeded: false, seededValue: 1.05 });
  assert.equal(overridden.showSeed, false);
  assert.equal(overridden.showReset, true);
  assert.match(overridden.resetTitle, /Reset to/);

  const empty = provenanceFor(null);
  assert.equal(empty.showSeed, false);
  assert.equal(empty.showReset, false);
  assert.match(empty.seedTitle, /Auto-filled/);
  assert.equal(empty.resetSymbol, "↺");
});

test("cellKind discriminates readout-table cells", () => {
  assert.equal(cellKind({ text: "hi" }), "text");
  assert.equal(cellKind({ text: "" }), "text");
  assert.equal(cellKind({ display: "1.0", unit: "SG" }), "number");
  assert.equal(cellKind(null), "empty");
  assert.equal(cellKind({}), "empty");
});

test("validation predicates", () => {
  assert.equal(hasInvalidCells([{ a: { holds: true } }]), false);
  assert.equal(hasInvalidCells([{ a: { holds: false } }]), true);
  assert.equal(hasInvalidCells([{ a: {} }]), false);
  assert.equal(hasInvalidCells(null), false);

  assert.equal(hasMissingNumber([{ mass_kg: 1 }], "mass_kg"), false);
  assert.equal(hasMissingNumber([{ mass_kg: null }], "mass_kg"), true);
  assert.equal(hasMissingNumber([{}], "mass_kg"), true);
  assert.equal(hasMissingNumber([], "mass_kg"), false);
  assert.equal(hasMissingNumber(null, "mass_kg"), false);
});

test("isRepresentative spots std: entries", () => {
  assert.equal(isRepresentative({ id: "std:base" }), true);
  assert.equal(isRepresentative("std:base"), true);
  assert.equal(isRepresentative({ id: "malt-1" }), false);
  assert.equal(isRepresentative(null), false);
});

test("unit helpers resolve symbols with the id as fallback", () => {
  const symbols = { mass: { kg: "kg", oz: "oz" } };
  assert.equal(preferredUnit({ mass: "oz" }, "mass", "kg"), "oz");
  assert.equal(preferredUnit({}, "mass", "kg"), "kg");
  assert.equal(preferredUnit(null, "mass", "kg"), "kg");
  assert.equal(unitSymbol(symbols, "mass", "oz"), "oz");
  assert.equal(unitSymbol(symbols, "mass", "unknown"), "unknown");
  assert.equal(unitSymbol(symbols, "missing", "kg"), "kg");
  assert.equal(unitSymbol(symbols, "mass", null, "kg"), "kg");
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
