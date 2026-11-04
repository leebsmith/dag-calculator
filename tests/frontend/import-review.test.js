import test from "node:test";
import assert from "node:assert/strict";

import { createImportReviewStore } from "../../frontend/src/store/importReview.js";
import { createSetupStore } from "../../frontend/src/store/setup.js";
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
  resumeLabel,
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

test("clearing a field is not a zero", () => {
  assert.equal(editTarget(PAYLOAD, "og", ""), PAYLOAD);
  assert.equal(editTarget(PAYLOAD, "og", "   "), PAYLOAD);
});

test("a record without a payload cannot throw on edit", () => {
  assert.equal(editTarget(null, "og", "1.08"), null);
  assert.equal(editTarget({}, "og", "1.08").targets, undefined);
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


// --- the store, not just the helpers ---------------------------------------
// The helpers were green while the store was broken: Object.assign flattened the
// readout getters to their values at creation, so every row rendered empty and
// editing crashed. These tests instantiate the store the way main.js does.

const RECORD = {
  id: "imp-1",
  status: "extracted",
  identity: null,
  extract: {
    source: { filename: "duel.pdf", page_count: 2, model: "m", prompt_version: 6, extracted_at: "t" },
    verification: { text_layer: true, numbers_checked: 31, unmatched: [] },
    payload: PAYLOAD,
  },
  ledger: [],
  suggestions: [],
  batch_id: null,
};

function storeWith(record) {
  const patches = [];
  const store = createImportReviewStore({
    client: { patch: async (id, body) => (patches.push({ id, body }), { ...record, ...body }) },
  });
  store.open(record);
  return { store, patches };
}

test("opening a record exposes it through the readouts", () => {
  const { store } = storeWith(RECORD);
  assert.equal(store.title, "Duel Master Black IPA");
  assert.equal(store.payload.targets.og.value, 1.078);
  assert.equal(store.targets.length, 7);
  assert.equal(store.counts.fermentables, 1);
  assert.equal(store.counts.hops, 1);
  assert.equal(store.verification.tone, "ok");
});

test("a correction updates the record and marks it dirty", () => {
  const { store } = storeWith(RECORD);
  store.setTarget("og", "1.080");
  assert.equal(store.payload.targets.og.value, 1.08);
  assert.equal(store.payload.targets.og.source, "user");
  assert.equal(store.dirty, true);
});

test("saving sends the whole extract and reports saved", async () => {
  const { store, patches } = storeWith(RECORD);
  store.setTarget("og", "1.080");
  await store.save();
  assert.equal(patches.length, 1);
  assert.equal(patches[0].id, "imp-1");
  assert.equal(patches[0].body.extract.payload.targets.og.value, 1.08);
  assert.equal(store.dirty, false);
  assert.equal(store.savedAt, "saved");
});

test("a failed save keeps the corrections and says so", async () => {
  const store = createImportReviewStore({
    client: { patch: async () => { throw new Error("nope"); } },
  });
  store.open(RECORD);
  store.setTarget("og", "1.080");
  assert.equal(await store.save(), null);
  assert.equal(store.error, "nope");
  assert.equal(store.dirty, true, "a failed save must not look saved");
});


// --- the ledger, through the store ----------------------------------------

const LEDGER_RECORD = {
  ...RECORD,
  ledger: [],
};

test("opening a record builds its ledger from the transcription", () => {
  const { store } = storeWith(LEDGER_RECORD);
  assert.equal(store.ledger.length, store.ledgerCounts.total);
  assert.ok(store.ledger.length > 0, "the payload produced lines");
  assert.equal(store.sections[0].id, "fermentables");
  assert.equal(store.unresolved.length, store.ledger.length - 1, "only the unmodelled line starts decided");
});

test("a choice sets the ref, the destination and the decision", () => {
  const { store } = storeWith(LEDGER_RECORD);
  const line = store.ledger.find((row) => row.section === "fermentables");
  store.chooseRef(line.line_id, { id: "std:pale-ale-malt" });
  const updated = store.ledger.find((row) => row.line_id === line.line_id);
  assert.equal(updated.ref, "std:pale-ale-malt");
  assert.equal(updated.destination, "grist.major_malts");
  assert.equal(updated.decision, "mapped");
  assert.equal(store.dirty, true);
});

test("a destination swap keeps the ref and asks for one when there is none", () => {
  const { store } = storeWith(LEDGER_RECORD);
  const line = store.ledger.find((row) => row.section === "hops");
  store.changeDestination(line.line_id, "batch.dry_hops");
  const updated = store.ledger.find((row) => row.line_id === line.line_id);
  assert.equal(updated.destination, "batch.dry_hops");
  assert.equal(updated.decision, "unresolved", "no ref means no decision");
});

test("ignoring a line records the reason it was dropped", () => {
  const { store } = storeWith(LEDGER_RECORD);
  const line = store.ledger.find((row) => row.section === "hops");
  store.ignoreLine(line.line_id);
  const updated = store.ledger.find((row) => row.line_id === line.line_id);
  assert.equal(updated.decision, "ignored");
  assert.equal(updated.reason, "not modelled");
  assert.equal(store.unresolved.some((row) => row.line_id === line.line_id), false);
});

test("saving sends the ledger and moves the record to mapping", async () => {
  const { store, patches } = storeWith(LEDGER_RECORD);
  const line = store.ledger.find((row) => row.section === "fermentables");
  store.chooseRef(line.line_id, { id: "std:pale-ale-malt" });
  await store.save();
  assert.equal(patches[0].body.ledger.length, store.ledger.length);
  assert.equal(patches[0].body.status, "mapping");
});

test("the stage only moves where the flow allows", () => {
  const { store } = storeWith(LEDGER_RECORD);
  assert.equal(store.stage, "transcribe");
  store.goTo("map");
  assert.equal(store.stage, "map");
  store.goTo("check");
  assert.equal(store.stage, "map", "the check stage has not landed");
});

test("candidate chips come from the injected catalogs", () => {
  const store = createImportReviewStore({
    client: { patch: async () => LEDGER_RECORD },
    catalogs: () => [{ id: "m1", name: "Maris Otter", standard_name: "Pale Ale Malt" }],
  });
  store.open(LEDGER_RECORD);
  const line = store.ledger.find((row) => row.section === "fermentables");
  const chips = store.suggestions(line);
  assert.equal(chips[0].id, "m1");
});


test("the queue says which step it resumes", () => {
  assert.equal(resumeLabel("extracted"), "Step 1 · Transcribe");
  assert.equal(resumeLabel("mapping"), "Step 2 · Map");
  assert.equal(resumeLabel("committed"), "Open");
});

test("a line can be found by the user's own search when the screen misses", () => {
  const catalogs = {
    malt: [
      { id: "carapils", name: "CARAPILS", standard_name: "Dextrin Malt", maltster: "Weyermann" },
      { id: "pale", name: "Pale Ale Malt", standard_name: "Pale Ale Malt", maltster: "Crisp" },
    ],
  };
  const store = createImportReviewStore({
    client: { patch: async () => LEDGER_RECORD },
    catalogs: (kind) => catalogs[kind] ?? [],
  });
  store.open(LEDGER_RECORD);
  const line = store.ledger.find((row) => row.section === "fermentables");

  assert.deepEqual(store.search(line), [], "no query, no results");

  store.setQuery(line.line_id, "carapils");
  assert.equal(store.queryFor(line.line_id), "carapils");
  assert.equal(store.search(line)[0].id, "carapils");

  store.setQuery(line.line_id, "zzzz");
  assert.deepEqual(store.search(line), [], "an unmatched search says so rather than guessing");
});


test("the new-batch button names what it is doing, by step", () => {
  const setup = createSetupStore({ client: {} });
  setup.state.mode = "scratch";
  assert.equal(setup.primaryLabel(), "Create batch");
  setup.state.busy = true;
  assert.equal(setup.primaryLabel(), "Creating…");

  setup.state.mode = "recipe";
  setup.state.busy = false;
  assert.equal(setup.primaryLabel(), "Read recipe");
  setup.state.busy = true;
  assert.equal(setup.primaryLabel(), "Step 1 · Reading recipe…", "reading is the first pass");
});
