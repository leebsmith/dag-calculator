import test from "node:test";
import assert from "node:assert/strict";

import {
  describeVerification,
  documentTitle,
  editTarget,
  fermentableRows,
  formatNumber,
  hopRows,
  mashRows,
  missingRequired,
  quantityLabel,
  recordSummary,
  sourceLabel,
  targetRows,
  unmodeledRows,
  unitSymbol,
  warningRows,
} from "../../frontend/src/views/import/review.js";

const PAYLOAD = {
  detected_recipes: [{ title: "Duel Master Black IPA", pages: [1, 2] }],
  title: "Duel Master Black IPA",
  style_name: "Black IPA",
  targets: {
    volume: { value: 5, unit: "gal", verbatim: "Batch size: 5 gallons", page: 1, source: "llm" },
    og: { value: 1.078, unit: "sg", verbatim: "OG: 1.078", page: 1, source: "llm" },
    ibu: { value: 60, unit: "ibu", verbatim: "IBUs: 60", page: 1, source: "llm" },
    abv: { value: 8, unit: "pct", verbatim: "ABV: 8%", page: 1, source: "user" },
  },
  fermentables: [
    {
      name: "Maris Otter",
      maltster: null,
      quantity: { value: 10, unit: "lb" },
      kind_hint: "malt",
      verbatim: "10 lb (4.5 kg) Maris Otter",
      page: 1,
    },
  ],
  hops: [
    {
      name: "Citra",
      quantity: { value: 1.5, unit: "oz" },
      stage_guess: "boil",
      stage_verbatim: "at 20 minutes",
      minutes: 20,
      ibu_contribution: 25,
      alpha_acid_pct: null,
      verbatim: "1.5 oz (43 g) Citra at 20 minutes [25 IBUs]",
      page: 1,
    },
  ],
  yeasts: [{ name: "British Ale", lab: "Wyeast", code: "1098", attenuation_pct: null, verbatim: "Wyeast 1098", page: 1 }],
  mashes: [
    {
      step_verbatim: "Mash at 152F for 60 minutes",
      temperature: { value: 152, unit: "f" },
      duration_min: 60,
      thickness: null,
      page: 2,
    },
  ],
  unmodeled: [
    { text: "1 tsp Irish moss", kind: "process_additive", stage: "15 min", quantity: { value: 1, unit: "tsp" }, page: 2 },
  ],
  warnings: [{ text: "Split dry hop lines", page: 2 }],
};

test("a target row carries the phrase and page the correction must preserve", () => {
  const rows = targetRows(PAYLOAD);
  const og = rows.find((row) => row.key === "og");
  assert.equal(og.display, "1.078 SG");
  assert.equal(og.verbatim, "OG: 1.078");
  assert.equal(og.page, 1);
  assert.equal(og.present, true);
});

test("an absent target is absent, not zero, and not a requirement", () => {
  const rows = targetRows(PAYLOAD);
  const fg = rows.find((row) => row.key === "fg");
  assert.equal(fg.present, false);
  assert.equal(fg.display, "");
  assert.equal(fg.value, null);
  assert.deepEqual(missingRequired(PAYLOAD), [], "FG and colour may be absent");
});

test("a missing required scalar is reported by label", () => {
  const payload = { ...PAYLOAD, targets: { og: PAYLOAD.targets.og } };
  assert.deepEqual(missingRequired(payload), ["Fermenter volume", "IBU"]);
});

test("verification wording distinguishes no check from a clean one", () => {
  assert.equal(describeVerification(null).tone, "unknown");
  assert.equal(describeVerification({ text_layer: false }).tone, "none");
  const clean = describeVerification({ text_layer: true, numbers_checked: 31, unmatched: [] });
  assert.equal(clean.tone, "ok");
  assert.match(clean.label, /31 numbers/);
  const flagged = describeVerification({
    text_layer: true,
    numbers_checked: 7,
    unmatched: [{ field: "mashes[0].duration_min", value: "60", page: 4 }],
  });
  assert.equal(flagged.tone, "warn");
  assert.match(flagged.detail, /duration_min = 60 \(p4\)/);
});

test("units read the way a brewer writes them", () => {
  assert.equal(unitSymbol("points"), "points");
  assert.equal(unitSymbol("plato"), "°P");
  assert.equal(unitSymbol("rpm"), "rpm");
  assert.equal(quantityLabel({ value: 1.5, unit: "oz" }), "1.5 oz");
  assert.equal(quantityLabel(null), "");
  assert.equal(formatNumber(1.078), "1.078");
  assert.equal(formatNumber(NaN), "");
});

test("collection rows keep the verbs and the page", () => {
  assert.deepEqual(fermentableRows(PAYLOAD)[0], {
    name: "Maris Otter",
    maltster: "",
    amount: "10 lb",
    kind: "malt",
    verbatim: "10 lb (4.5 kg) Maris Otter",
    page: 1,
  });
  const hop = hopRows(PAYLOAD)[0];
  assert.equal(hop.stage, "boil");
  assert.equal(hop.ibu, 25);
  assert.equal(hop.amount, "1.5 oz");
  assert.equal(mashRows(PAYLOAD)[0].temperature, "152 °F");
  assert.equal(unmodeledRows(PAYLOAD)[0].kind, "process_additive");
  assert.equal(warningRows(PAYLOAD)[0].page, 2);
  assert.equal(sourceLabel("user"), "you");
  assert.equal(sourceLabel("llm"), "page");
});

test("a corrected target becomes the user's, keeping the original phrase", () => {
  const next = editTarget(PAYLOAD, "og", "1.080");
  const target = next.targets.og;
  assert.equal(target.value, 1.08);
  assert.equal(target.source, "user");
  assert.equal(target.verbatim, "OG: 1.078", "the page still said what it said");
  assert.equal(target.page, 1);
  assert.equal(PAYLOAD.targets.og.value, 1.078, "the original payload is not mutated");
});

test("completing a missing target records that a person typed it", () => {
  const next = editTarget(PAYLOAD, "fg", "1.019");
  const target = next.targets.fg;
  assert.equal(target.value, 1.019);
  assert.equal(target.source, "user");
  assert.equal(target.verbatim, "entered by you");
  assert.equal(target.page, 1);
});

test("a non-numeric correction is ignored rather than stored", () => {
  assert.equal(editTarget(PAYLOAD, "og", "about 1.08"), PAYLOAD);
});

test("the header summarises where the record came from", () => {
  const record = {
    extract: { source: { filename: "recipe.pdf", page_count: 2, model: "m", prompt_version: 6, extracted_at: "t" }, payload: PAYLOAD },
  };
  assert.equal(documentTitle(record), "Duel Master Black IPA");
  assert.equal(recordSummary(record).pages, 2);
  assert.equal(recordSummary(record).style, "Black IPA");
  assert.equal(documentTitle(null), "Recipe");
});
