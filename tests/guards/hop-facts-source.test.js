// The committed hop facts are the acquisition record: one observation per
// source, variety and attribute, carrying the value as printed beside its
// normalised result. The seed builder consumes them, so a malformed observation
// is not a rendering bug — it is a wrong number in the catalogue. This guard
// pins the shape the builder relies on.

import test from "node:test";
import assert from "node:assert/strict";

import { read } from "./util.js";

const facts = () => JSON.parse(read("data/sources/hop-facts.json"));

const ATTRIBUTES = new Set([
  "total_oil",
  "myrcene",
  "humulene",
  "caryophyllene",
  "farnesene",
  "linalool",
  "geraniol",
  "alpha",
  "beta",
  "cohumulone",
]);

const UNITS = new Set(["percent", "fraction", "ml_per_100g", "unstated"]);

test("every observation is complete and resolvable", () => {
  const { sources, observations } = facts();
  const offenders = [];
  for (const row of observations) {
    const at = `${row.variety_id}/${row.source_id}/${row.attribute}`;
    if (!sources[row.source_id]) offenders.push(`${at}: unknown source`);
    if (!ATTRIBUTES.has(row.attribute)) offenders.push(`${at}: unknown attribute`);
    if (!UNITS.has(row.stated_unit)) offenders.push(`${at}: unknown unit ${row.stated_unit}`);
    for (const key of ["variety_id", "source_id", "attribute", "stated_value", "stated_basis", "value_kind", "source_label"]) {
      if (typeof row[key] !== "string" || !row[key]) offenders.push(`${at}: missing ${key}`);
    }
    if (!("normalised" in row)) offenders.push(`${at}: no normalised value`);
  }
  assert.deepEqual(offenders, [], "an observation the builder cannot resolve is a hole in the catalogue");
});

// A source may legitimately yield two reads for one variety: a catalogue with a
// local and an imported variety of the same name, or a table the parser reads
// twice. Every disagreement is enumerated here, so a new one fails loudly and
// the synthesis has a finite list to resolve.
const KNOWN_COLLISIONS = new Set([
  "Cascade/hpa-catalogue/alpha",
  "Cascade/hpa-catalogue/total_oil",
  "Galena/hga-2017/alpha",
  "Galena/hga-2017/beta",
  "Galena/hga-2017/cohumulone",
  "Galena/hga-2017/total_oil",
  "Galena/hga-2020/alpha",
  "Galena/hga-2020/beta",
  "Galena/hga-2020/cohumulone",
  "Galena/hga-2020/total_oil",
]);

test("duplicate observations either agree or are a known collision", () => {
  const grouped = new Map();
  for (const row of facts().observations) {
    const key = `${row.variety_id}/${row.source_id}/${row.attribute}`;
    const list = grouped.get(key) ?? [];
    list.push(row);
    grouped.set(key, list);
  }
  const offenders = [];
  for (const [key, rows] of grouped) {
    if (rows.length < 2) continue;
    const distinct = new Set(rows.map((row) => JSON.stringify(row.normalised)));
    if (distinct.size === 1) continue;
    if (!KNOWN_COLLISIONS.has(key)) offenders.push(`${key}: ${[...distinct].join(" vs ")}`);
  }
  assert.deepEqual(offenders, [], "an unexplained double read is a parse bug or an identity collision");
});

test("normalised values agree with their stated kind", () => {
  const offenders = [];
  for (const row of facts().observations) {
    const value = row.normalised;
    if (value === null) {
      if (row.stated_unit !== "unstated") offenders.push(`${row.variety_id}/${row.source_id}: null with a unit`);
      continue;
    }
    if (row.value_kind === "point" && Array.isArray(value)) {
      offenders.push(`${row.variety_id}/${row.source_id}: point stored as range`);
    }
    if (row.value_kind !== "point" && !Array.isArray(value)) {
      offenders.push(`${row.variety_id}/${row.source_id}: ${row.value_kind} stored as a point`);
    }
    const numbers = (Array.isArray(value) ? value : [value]).filter((v) => v !== null);
    for (const number of numbers) {
      if (!Number.isFinite(number)) offenders.push(`${row.variety_id}/${row.source_id}: ${number}`);
      if (row.stated_unit !== "ml_per_100g" && (number < 0 || number > 1)) {
        offenders.push(`${row.variety_id}/${row.source_id}: ${number} is not a fraction`);
      }
    }
  }
  assert.deepEqual(offenders, [], "a normalised value that contradicts its kind would poison a mean");
});

test("total oil stays inside a plausible range", () => {
  // A cell that embeds its unit ("1.1 mL/100g") once leaked the 100 into the
  // measurement, pricing hops at 50 mL/100 g. Anything above 20 is a unit bug,
  // not a variety.
  const offenders = [];
  for (const row of facts().observations) {
    if (row.attribute !== "total_oil" || row.normalised === null) continue;
    const values = Array.isArray(row.normalised) ? row.normalised : [row.normalised];
    for (const value of values) {
      if (value !== null && (value < 0 || value > 20)) offenders.push(`${row.variety_id}/${row.source_id}: ${value}`);
    }
  }
  assert.deepEqual(offenders, [], "total oil is mL per 100 g; a unit phrase must never become the number");
});

test("only the aggregator is marked as one", () => {
  const offenders = facts().observations.filter(
    (row) => (row.basis_tier === "aggregator") !== (row.source_id === "hopslist")
  );
  assert.deepEqual(
    offenders.map((row) => `${row.variety_id}/${row.source_id}`),
    [],
    "the aggregator tier is a property of the source, marked on every row"
  );
});
