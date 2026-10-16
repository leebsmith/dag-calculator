import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const seed = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../data/seeds/styles.json", import.meta.url)), "utf8")
);

const SPECIALTIES = [
  "21B Belgian IPA",
  "21B Black IPA",
  "21B Brown IPA",
  "21B Red IPA",
  "21B Rye IPA",
  "21B White IPA",
];

test("Specialty IPA sub-types are present with vital statistics", () => {
  for (const id of SPECIALTIES) {
    const style = seed[id];
    assert.ok(style, `missing style "${id}"`);
    assert.ok(style.og_min && style.og_max, `${id} missing OG range`);
    assert.ok(style.abv_min && style.abv_max, `${id} missing ABV range`);
  }
});

test("the Specialty IPA container is replaced by its sub-types", () => {
  assert.equal(seed["21B"], undefined);
});
