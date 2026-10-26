// Vendor yeast source contract: White Labs publishes an apparent attenuation
// range and a STA1 QC result per strain (and nothing else does). The committed
// scrape carries both with a per-page hash, so D4b can consume ranges and STA1
// without guessing. This guard pins the shape; the sources-manifest guard pins
// the content hash.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const SOURCE = JSON.parse(
  readFileSync(
    new URL("../../data/sources/whitelabs-yeasts.json", import.meta.url),
    "utf8"
  )
);
const SCHEMA = JSON.parse(
  readFileSync(
    new URL("../../data/sources/whitelabs-yeasts.schema.json", import.meta.url),
    "utf8"
  )
);

const ENTRY_KEYS = new Set(Object.keys(SCHEMA.$defs.entry.properties));
const ENTRY_REQUIRED = SCHEMA.$defs.entry.required;

const SHA256 = /^[0-9a-f]{64}$/;
const URL_PATTERN = /^https:\/\/www\.whitelabs\.com\/yeast-single\?id=[0-9]+&type=YEAST$/;

test("White Labs source is the versioned envelope", () => {
  assert.equal(SOURCE.schema_version, 1);
  assert.equal(SOURCE.source, "White Labs");
  assert.equal(SOURCE.upstream, "https://www.whitelabs.com/yeast-bank");
  assert.ok(Array.isArray(SOURCE.entries) && SOURCE.entries.length > 0);
  assert.equal(typeof SOURCE.generated_at, "string");
});

test("every vendor entry conforms to the pinned schema shape", () => {
  assert.equal(SCHEMA.properties.schema_version.const, SOURCE.schema_version);
  assert.equal(SCHEMA.properties.source.const, SOURCE.source);
  for (const [index, entry] of SOURCE.entries.entries()) {
    const label = `[${index}] ${entry?.strain ?? "?"}`;
    for (const key of Object.keys(entry)) {
      assert.ok(ENTRY_KEYS.has(key), `${label} has undeclared field "${key}"`);
    }
    for (const key of ENTRY_REQUIRED) {
      assert.ok(key in entry, `${label} is missing "${key}"`);
    }
  }
});

test("every vendor entry is cited by URL and page hash", () => {
  for (const [index, entry] of SOURCE.entries.entries()) {
    const label = `[${index}] ${entry?.strain ?? "?"}`;
    assert.match(entry.url, URL_PATTERN, `${label}.url`);
    assert.match(entry.sha256, SHA256, `${label}.sha256`);
    assert.ok(!Number.isNaN(Date.parse(entry.retrieved_at)), `${label}.retrieved_at`);
    assert.match(entry.strain, /^[A-Z]+[0-9]+[A-Z0-9]*$/, `${label}.strain`);
    assert.ok(entry.name.trim().length > 0, `${label}.name`);
  }
});

test("attenuation is a positive apparent range", () => {
  for (const [index, entry] of SOURCE.entries.entries()) {
    const label = `[${index}] ${entry?.strain ?? "?"}`;
    assert.equal(entry.attenuation_basis, "apparent", `${label}.attenuation_basis`);
    for (const key of ["attenuation_low_pct", "attenuation_high_pct"]) {
      assert.equal(typeof entry[key], "number", `${label}.${key}`);
      assert.ok(entry[key] > 0 && entry[key] <= 100, `${label}.${key} range`);
    }
    assert.ok(
      entry.attenuation_low_pct <= entry.attenuation_high_pct,
      `${label} low > high`
    );
    if (entry.temp_low_c !== null) {
      assert.ok(entry.temp_low_c <= entry.temp_high_c, `${label} temp low > high`);
    }
  }
});

test("STA1 is tri-state and agrees with the verbatim label", () => {
  let positive = 0;
  let negative = 0;
  let unknown = 0;
  for (const [index, entry] of SOURCE.entries.entries()) {
    const label = `[${index}] ${entry?.strain ?? "?"}`;
    assert.ok(
      entry.sta1 === true || entry.sta1 === false || entry.sta1 === null,
      `${label}.sta1 must be true, false, or null`
    );
    if (entry.sta1 === true) {
      positive += 1;
      assert.match(entry.sta1_text, /positive/i, `${label}.sta1_text`);
    } else if (entry.sta1 === false) {
      negative += 1;
      assert.match(entry.sta1_text, /negative/i, `${label}.sta1_text`);
    } else {
      unknown += 1;
      assert.doesNotMatch(entry.sta1_text, /positive|negative/i, `${label}.sta1_text`);
    }
  }
  assert.ok(negative > 0, "no STA1-negative strain captured");
  assert.ok(positive + negative + unknown === SOURCE.entries.length);
});

test("at least one STA1-positive strain is captured", () => {
  const positive = SOURCE.entries.filter((entry) => entry.sta1 === true);
  assert.ok(
    positive.length > 0,
    "White Labs publishes STA1-positive strains; recapture if the scrape lost them"
  );
});
