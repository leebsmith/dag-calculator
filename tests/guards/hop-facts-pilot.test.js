// The pilot sample is a contract artefact, not a source. It exists so the
// envelope matrix stays checkable after the probe is deleted, and so the
// production scrape has a golden sample to regress against. Nothing may read it
// as data: a seed builder that reaches it turns ten rows into an ingredient
// catalogue, and the vendored source it pretends to be does not exist.

import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

import { read } from "./util.js";

const fixture = () =>
  JSON.parse(read("tests/conformance/fixtures/hop-facts/pilot-sample.json"));

const ATTRIBUTES = [
  "alpha",
  "beta",
  "total_oil",
  "cohumulone",
  "myrcene",
  "humulene",
  "caryophyllene",
  "farnesene",
];

const OIL_FRACTIONS = ["myrcene", "humulene", "caryophyllene", "farnesene"];

test("every observation names a source, a unit, a basis and both halves", () => {
  const { sources, observations } = fixture();
  const offenders = [];
  for (const row of observations) {
    const label = `${row.variety_id}/${row.source_id}/${row.attribute}`;
    if (!sources[row.source_id]) offenders.push(`${label}: unknown source`);
    if (!ATTRIBUTES.includes(row.attribute)) offenders.push(`${label}: unknown attribute`);
    if (!row.stated_unit) offenders.push(`${label}: no stated_unit`);
    if (!row.stated_basis) offenders.push(`${label}: no stated_basis`);
    if (!row.source_label) offenders.push(`${label}: no source_label`);
    if (!("stated_value" in row)) offenders.push(`${label}: no stated_value`);
    if (!("normalised" in row)) offenders.push(`${label}: no normalised`);
  }
  assert.deepEqual(offenders, [], "an observation must carry both halves of the measurement");
});

test("every range is ordered and every point is a point", () => {
  const offenders = [];
  for (const row of fixture().observations) {
    const norm = row.normalised;
    if (norm === null) {
      if (row.stated_unit !== "unstated") {
        offenders.push(`${row.variety_id}/${row.attribute}: null normalised with a stated unit`);
      }
      continue;
    }
    if (Array.isArray(norm)) {
      const [low, high] = norm;
      if (low !== null && low > high) offenders.push(`${row.variety_id}/${row.attribute}: ${low} > ${high}`);
      if (row.value_kind === "point") offenders.push(`${row.variety_id}/${row.attribute}: point stored as range`);
      if (row.value_kind === "max" && low !== null) offenders.push(`${row.variety_id}/${row.attribute}: max has a floor`);
    } else if (row.value_kind !== "point") {
      offenders.push(`${row.variety_id}/${row.attribute}: ${row.value_kind} stored as a point`);
    }
  }
  assert.deepEqual(offenders, [], "a range must be ordered and an open bound must stay open");
});

test("oil fractions are normalised to fractions that can sum", () => {
  const groups = new Map();
  for (const row of fixture().observations) {
    if (!OIL_FRACTIONS.includes(row.attribute)) continue;
    const key = `${row.variety_id}/${row.source_id}`;
    const set = groups.get(key) ?? {};
    set[row.attribute] = row.normalised;
    groups.set(key, set);
  }
  const offenders = [];
  for (const [key, set] of groups) {
    const values = Object.entries(set).map(([attribute, norm]) => {
      const value = Array.isArray(norm) ? norm[1] : norm;
      if (value > 1) offenders.push(`${key}/${attribute}: ${value} is not a fraction`);
      return value;
    });
    const total = values.reduce((sum, value) => sum + value, 0);
    if (values.length === OIL_FRACTIONS.length && total > 1) {
      offenders.push(`${key}: fractions sum to ${total.toFixed(3)}`);
    }
  }
  assert.deepEqual(offenders, [], "a fraction above 1, or a complete set summing above 1, is a basis error");
});

test("co-humulone stays inside a plausible band", () => {
  const offenders = [];
  for (const row of fixture().observations) {
    if (row.attribute !== "cohumulone") continue;
    const values = (Array.isArray(row.normalised) ? row.normalised : [row.normalised]).filter(
      (value) => value !== null
    );
    for (const value of values) {
      if (value < 0.05 || value > 0.6) offenders.push(`${row.variety_id}/${row.source_id}: ${value}`);
    }
  }
  assert.deepEqual(offenders, [], "co-humulone is a share of alpha acids, not of the cone");
});

test("no seed builder reads the fixture", () => {
  const scripts = readdirSync("scripts").filter((file) => file.startsWith("build-"));
  const offenders = scripts.filter((file) =>
    readFileSync(`scripts/${file}`, "utf8").includes("pilot-sample")
  );
  assert.deepEqual(offenders, [], "the pilot sample is a fixture; a builder that reads it makes it a source");
});
