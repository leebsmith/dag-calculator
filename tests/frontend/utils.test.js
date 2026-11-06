import test from "node:test";
import assert from "node:assert/strict";

import {
  EMPTY_FIELD,
  boundaryErrorView,
  boundsOf,
  cellKind,
  cycleUnit,
  fieldOr,
  hasInvalidCells,
  hasMissingNumber,
  indexFields,
  isRepresentative,
  joinNonEmpty,
  optionLabel,
  preferredUnit,
  provenanceFor,
  safeFilename,
  solverErrorLabel,
  toggleFilter,
  toggleInList,
  unitSymbol,
} from "../../frontend/src/utils.js";

test("joinNonEmpty suppresses empty separators", () => {
  assert.equal(joinNonEmpty(["a", null, "", "b"]), "a • b");
  assert.equal(joinNonEmpty(["a", "b"], " · "), "a · b");
  assert.equal(joinNonEmpty([null, undefined, ""]), "");
  assert.equal(joinNonEmpty("nope"), "");
  assert.equal(joinNonEmpty([0, 1]), "0 • 1");
});

test("optionLabel falls back to the raw value when unlabelled", () => {
  assert.equal(optionLabel({ MASH_ONLY: "Mash only salts" }, "MASH_ONLY"), "Mash only salts");
  assert.equal(optionLabel({ MASH_ONLY: "Mash only salts" }, "PROPORTIONAL"), "PROPORTIONAL");
  assert.equal(optionLabel(null, "MASH_ONLY"), "MASH_ONLY");
  assert.equal(optionLabel(undefined, "MASH_ONLY"), "MASH_ONLY");
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

test("safeFilename slugifies a download name", () => {
  assert.equal(safeFilename("House Pale"), "house-pale.json");
  assert.equal(safeFilename("House Pale / v2", "report-bundle.json"), "house-pale-v2.report-bundle.json");
  assert.equal(safeFilename("  ---  "), "batch.json");
  assert.equal(safeFilename(null), "batch.json");
  assert.equal(safeFilename(42), "batch.json");
  assert.equal(safeFilename("Saison", ".json"), "saison.json");
  assert.equal(safeFilename("Saison", ""), "saison.json");
});

test("solverErrorLabel names declared codes and degrades to a generic label", () => {
  assert.equal(solverErrorLabel("MASH_TUN_TOO_SMALL"), "Mash tun is too small");
  assert.equal(
    solverErrorLabel("BRACKET_NO_SIGN_CHANGE"),
    "Extract target is not reachable at this mash"
  );
  assert.equal(solverErrorLabel("NOT_A_CODE"), "Solver error");
  assert.equal(solverErrorLabel(""), "Solver error");
  assert.equal(solverErrorLabel(null), "Solver error");
  assert.equal(solverErrorLabel(42), "Solver error");
});

test("boundaryErrorView keeps the raw code and message beside the label", () => {
  assert.deepEqual(
    boundaryErrorView({ code: "MASH_TOO_THIN", message: "too thin" }),
    { code: "MASH_TOO_THIN", message: "too thin", label: "Mash is too thin for the grain bed" }
  );
  assert.deepEqual(boundaryErrorView({}), { code: "", message: "", label: "Solver error" });
  assert.equal(boundaryErrorView(null), null);
  assert.equal(boundaryErrorView(undefined), null);
});
