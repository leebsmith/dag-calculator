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
  "21B Brut IPA",
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

test("container and category-header records are not seeded", () => {
  assert.equal(seed["21B"], undefined); // bare Specialty IPA container
  assert.equal(seed["21"], undefined); // category header (21 IPA)
  assert.equal(seed["27"], undefined); // category header (27 Historical Beer)
});

test("2021 additions and composite historical ids are present", () => {
  assert.ok(seed["21C"], "missing Hazy IPA");
  for (const id of ["27A Kellerbier", "27A Kentucky Common", "27A Sahti"]) {
    assert.ok(seed[id], `missing ${id}`);
  }
  assert.equal(seed["21C"].category_id, "21");
  assert.equal(seed["21C"].category_name, "IPA");
});
