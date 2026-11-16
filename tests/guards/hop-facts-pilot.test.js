// The pilot sample is a contract artefact, not a source. It exists so the
// envelope matrix stays checkable after the probe is deleted, and so the
// production scrape has a golden sample to regress against. Nothing may read it
// as data: a seed builder that reaches it turns ten rows into an ingredient
// catalogue, and the vendored source it pretends to be does not exist.

import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { join } from "node:path";

import { ROOT, read } from "./util.js";

const FIXTURES = [
  "tests/conformance/fixtures/hop-facts/pilot-sample.json",
  "tests/conformance/fixtures/hop-facts/expanded-sample.json",
];

const fixture = (path) => JSON.parse(read(path));

const ATTRIBUTES = [
  "total_oil",
  "myrcene",
  "humulene",
  "caryophyllene",
  "farnesene",
  "linalool",
  "alpha",
  "beta",
  "cohumulone",
];

const OIL_FRACTIONS = ["myrcene", "humulene", "caryophyllene", "farnesene", "linalool"];

test("every observation names a source, a unit, a basis and both halves", () => {
  const offenders = [];
  for (const path of FIXTURES) {
    const { sources, observations } = fixture(path);
    for (const row of observations) {
      const label = `${path.split("/").pop()} ${row.variety_id}/${row.source_id}/${row.attribute}`;
      if (!sources[row.source_id]) offenders.push(`${label}: unknown source`);
      if (!ATTRIBUTES.includes(row.attribute)) offenders.push(`${label}: unknown attribute`);
      if (!row.stated_unit) offenders.push(`${label}: no stated_unit`);
      if (!row.stated_basis) offenders.push(`${label}: no stated_basis`);
      if (!row.source_label) offenders.push(`${label}: no source_label`);
      if (!("stated_value" in row)) offenders.push(`${label}: no stated_value`);
      if (!("normalised" in row)) offenders.push(`${label}: no normalised`);
    }
  }
  assert.deepEqual(offenders, [], "an observation must carry both halves of the measurement");
});

test("every range is ordered and every point is a point", () => {
  const offenders = [];
  for (const path of FIXTURES) {
    for (const row of fixture(path).observations) {
      const where = `${path.split("/").pop()} ${row.variety_id}/${row.attribute}`;
      const norm = row.normalised;
      if (norm === null) {
        if (row.stated_unit !== "unstated") {
          offenders.push(`${where}: null normalised with a stated unit`);
        }
        continue;
      }
      if (Array.isArray(norm)) {
        const [low, high] = norm;
        if (low !== null && low > high) offenders.push(`${where}: ${low} > ${high}`);
        if (row.value_kind === "point") offenders.push(`${where}: point stored as range`);
        if (row.value_kind === "max" && low !== null) offenders.push(`${where}: max has a floor`);
      } else if (row.value_kind !== "point") {
        offenders.push(`${where}: ${row.value_kind} stored as a point`);
      }
    }
  }
  assert.deepEqual(offenders, [], "a range must be ordered and an open bound must stay open");
});

test("oil fractions are normalised to fractions that can sum", () => {
  const offenders = [];
  for (const path of FIXTURES) {
    const groups = new Map();
    for (const row of fixture(path).observations) {
      if (!OIL_FRACTIONS.includes(row.attribute)) continue;
      const key = `${row.variety_id}/${row.source_id}`;
      const set = groups.get(key) ?? {};
      set[row.attribute] = row.normalised;
      groups.set(key, set);
    }
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
  }
  assert.deepEqual(offenders, [], "a fraction above 1, or a complete set summing above 1, is a basis error");
});

test("co-humulone stays inside a plausible band", () => {
  const offenders = [];
  for (const path of FIXTURES) {
    for (const row of fixture(path).observations) {
      if (row.attribute !== "cohumulone") continue;
      const values = (Array.isArray(row.normalised) ? row.normalised : [row.normalised]).filter(
        (value) => value !== null
      );
      for (const value of values) {
        if (value < 0.05 || value > 0.6) {
          offenders.push(`${path.split("/").pop()} ${row.variety_id}/${row.source_id}: ${value}`);
        }
      }
    }
  }
  assert.deepEqual(offenders, [], "co-humulone is a share of alpha acids, not of the cone");
});

test("only the aggregator carries an aggregator tier", () => {
  const offenders = [];
  for (const path of FIXTURES) {
    const { sources, observations } = fixture(path);
    for (const row of observations) {
      const claimed = row.basis_tier === "aggregator";
      if (claimed !== (row.source_id === "hopslist")) {
        offenders.push(`${row.variety_id}/${row.source_id}/${row.attribute}`);
      }
      if (claimed && sources[row.source_id].id !== "hopslist") offenders.push(`${row.source_id}: tier mismatch`);
    }
  }
  assert.deepEqual(offenders, [], "the aggregator tier is a property of the source, marked on every row");
});

test("identity-only sources contribute no measurement", () => {
  const offenders = [];
  for (const path of FIXTURES) {
    const { sources, observations } = fixture(path);
    const measured = new Set(observations.map((row) => row.source_id));
    if (measured.has("usda-cultivars")) offenders.push(`${path.split("/").pop()}: usda measured something`);
    if (sources["usda-cultivars"] && !sources["usda-cultivars"].identity) {
      offenders.push(`${path.split("/").pop()}: usda lost its identity map`);
    }
  }
  assert.deepEqual(offenders, [], "a pedigree source may name a variety but must not measure it");
});

test("the form split holds: Cryo Cascade carries roughly twice the oil of T-90", () => {
  const sources = fixture(FIXTURES[1]).sources;
  assert.ok(sources["hga-2020"], "the expanded sample should carry the HGA survey");
  const t90 = fixture(FIXTURES[1]).observations.find(
    (row) => row.variety_id === "Cascade" && row.source_id === "hga-2020" && row.attribute === "total_oil"
  );
  assert.ok(t90 && Array.isArray(t90.normalised), "Cascade T-90 oil should be a range");
  const t90Mid = (t90.normalised[0] + t90.normalised[1]) / 2;

  const cryo = JSON.parse(read("data/seeds/hop-products.json"))["cryo-cascade"];
  assert.ok(cryo, "the seed should carry Cryo Cascade");
  const ratio = cryo.total_oil_ml_per_100g / t90Mid;
  assert.ok(ratio > 2 && ratio < 3.5, `Cryo ÷ T-90 oil ratio is ${ratio.toFixed(2)}, expected near 2.7`);
});

test("no seed builder reads the fixtures", () => {
  const scripts = readdirSync(join(ROOT, "scripts")).filter((file) => file.startsWith("build-"));
  const offenders = scripts.filter((file) => {
    const body = read(`scripts/${file}`);
    return body.includes("pilot-sample") || body.includes("expanded-sample");
  });
  assert.deepEqual(offenders, [], "the pilot samples are fixtures; a builder that reads one makes it a source");
});

