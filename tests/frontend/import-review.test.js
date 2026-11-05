import test from "node:test";
import assert from "node:assert/strict";

import { createImportReviewStore } from "../../frontend/src/store/importReview.js";
import { createSetupStore } from "../../frontend/src/store/setup.js";
import { read } from "../guards/util.js";
import { applyRef, buildLedger } from "../../frontend/src/views/import/ledger.js";
import {
  describeVerification,
  documentTitle,
  originTitle,
  originYeastOutcome,
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
  assert.equal(sourceLabel("llm"), "imported recipe");
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
  assert.equal(
    store.unresolved.length,
    store.ledger.length - 2,
    "the unmodelled line and the proposed mash step start decided"
  );
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

function storeLedgerFullyDecided() {
  return buildLedger(RECORD.extract.payload).map((row) =>
    row.decision === "ignored"
      ? row
      : applyRef(row, { id: `ref-${row.line_id}` }, row.section === "yeasts" ? "yeast" : undefined)
  );
}

test("saving the map is the stage's forward action once every line is decided", async () => {
  const patches = [];
  const record = { ...LEDGER_RECORD, status: "extracted" };
  const store = createImportReviewStore({
    client: { patch: async (id, body) => (patches.push(body), { ...record, ...body }) },
  });
  store.open(record);
  store.goTo("map");

  await store.saveAndAdvance();
  assert.equal(store.stage, "map", "an incomplete map saves and stays");

  for (const row of store.unresolved) {
    store.ignoreLine(row.line_id, "not modelled");
  }
  assert.equal(store.unresolved.length, 0);
  await store.saveAndAdvance();
  assert.equal(store.stage, "check", "a complete map opens the check in the same press");
  assert.equal(patches.at(-1).status, "mapping", "the record says where the work stands");
});

test("nothing is saved when there is nothing to save, and the stage still advances", async () => {
  const patches = [];
  const mapped = {
    ...LEDGER_RECORD,
    status: "mapping",
    ledger: storeLedgerFullyDecided(),
  };
  const store = createImportReviewStore({
    client: { patch: async (id, body) => (patches.push(body), { ...mapped, ...body }) },
  });
  store.open(mapped);
  assert.equal(store.stage, "map", "a record under way reopens on the map");
  assert.equal(store.dirty, false);
  await store.saveAndAdvance();
  assert.deepEqual(patches, [], "no write when nothing changed");
  assert.equal(store.stage, "check");
});

test("the stages name themselves as a sequence, so check reads as the last one", () => {
  const { store } = storeWith(LEDGER_RECORD);
  assert.equal(store.stageLabel, "Step 1 of 3 · Transcribe");
  store.goTo("map");
  assert.equal(store.stageLabel, "Step 2 of 3 · Map");
  store.goTo("check");
  assert.equal(store.stageLabel, "Step 3 of 3 · Check and create");
});

test("the stage only moves where the flow allows", () => {
  const { store } = storeWith(LEDGER_RECORD);
  assert.equal(store.stage, "transcribe");
  store.goTo("map");
  assert.equal(store.stage, "map");
  store.goTo("check");
  assert.equal(store.stage, "check", "the check stage exists now");
  store.goTo("nonsense");
  assert.equal(store.stage, "check", "an unknown stage changes nothing");
});

test("the undecided list names every line the notice counts", () => {
  const { store } = storeWith(LEDGER_RECORD);
  assert.equal(store.unresolved.length, store.ledger.length - 2);
  for (const row of store.unresolved) {
    assert.ok(row.name || row.text, "a listed line has something to read");
    assert.ok(row.section, "a listed line says what kind of line it is");
    assert.equal(store.isUndecided(row), true);
  }
  assert.deepEqual(
    store.ledger.filter((row) => store.isUndecided(row)),
    store.unresolved,
    "the badge, the notice and the count follow one predicate"
  );
});

test("deciding a line drops it from the notice", () => {
  const { store } = storeWith(LEDGER_RECORD);
  const line = store.ledger.find((row) => row.section === "fermentables");
  assert.equal(store.isUndecided(line), true);
  store.chooseRef(line.line_id, { id: "std:pale-ale-malt" });
  const updated = store.ledger.find((row) => row.line_id === line.line_id);
  assert.equal(store.isUndecided(updated), false);
  assert.equal(store.isUndecided(undefined), false, "a missing row is not a decision to make");
});

test("the map states the problems on the lines, not in a strip", () => {
  const page = read("frontend/src/partials/import-map.html");
  assert.match(page, /\$store\.importReview\.unresolved\.length/, "the header still counts");
  assert.match(page, /rowIssue\(row\)/, "each row says what it needs");
  assert.doesNotMatch(
    page,
    /x-for="row in \$store\.importReview\.unresolved"/,
    "no second listing of the same rows at the top"
  );
});

test("candidate chips come from the injected catalogs", () => {  const store = createImportReviewStore({
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


// --- verdict, sections, failure -------------------------------------------

const EMPTY_BATCH = {
  ...RECORD,
  id: "imp-spec",
  extract: {
    ...RECORD.extract,
    payload: {
      document_type: "spec_sheet",
      quantity_form: "mass",
      detected_recipes: [{ title: "Hefeweizen", pages: [1] }],
      title: "Hefeweizen",
      targets: { og: { value: 13.5, unit: "plato", verbatim: "13.5 °P", page: 1 } },
      fermentables: [],
      hops: [],
      yeasts: [],
      mashes: [{ step_verbatim: "Mash in", temperature: { value: 43, unit: "c" }, duration_min: 10, page: 1 }],
      unmodeled: [{ text: "Pilsner 136 KG/10HL", kind: "other", page: 1 }],
      warnings: [],
    },
  },
  ledger: [],
};

test("a spec sheet gets a verdict, and the verdict names the evidence", () => {
  const { store } = storeWith(EMPTY_BATCH);
  assert.equal(store.noBatchQuantities, true);
  assert.match(store.verdict.title, /production specification/i);
  assert.match(store.verdict.detail, /per unit of production volume/);
  assert.equal(store.verdict.reason.includes("spec sheet"), true);
});

test("a normal recipe has no verdict", () => {
  const { store } = storeWith(RECORD);
  assert.equal(store.noBatchQuantities, false);
  assert.equal(store.verdict, null);
});

test("an empty section explains itself instead of going silent", () => {
  const { store } = storeWith(EMPTY_BATCH);
  const hops = store.sections.find((section) => section.id === "hops");
  assert.equal(hops.empty, true);
  assert.match(hops.note, /per unit of production volume/);
  const mash = store.sections.find((section) => section.id === "mashes");
  assert.equal(mash.empty, false);
});

test("marking a record failed keeps the interpretation and closes", async () => {
  const patches = [];
  const store = createImportReviewStore({
    client: { patch: async (id, body) => (patches.push({ id, body }), { ...EMPTY_BATCH, ...body }) },
  });
  store.open(EMPTY_BATCH);
  assert.equal(await store.markFailed(), true);
  assert.equal(patches[0].body.status, "failed");
  assert.match(patches[0].body.failure_reason, /production volume/);
  assert.equal(store.record, null, "the record is closed after marking it");
});


// --- the whirlpool IBU split ----------------------------------------------

const HOP_PAYLOAD = {
  ...RECORD.extract.payload,
  targets: { ibu: { value: 60, unit: "ibu", verbatim: "60 IBU", page: 1 } },
  hops: [
    { name: "Citra", quantity: { value: 1.5, unit: "oz" }, alpha_acid_pct: 12, stage_guess: "boil", minutes: 20, ibu_contribution: 25, verbatim: "Citra 20", page: 1 },
    { name: "Amarillo", quantity: { value: 1, unit: "oz" }, alpha_acid_pct: 9, stage_guess: "whirlpool", ibu_contribution: 8, verbatim: "Amarillo wp", page: 1 },
  ],
};
const HOP_RECORD = { ...RECORD, extract: { ...RECORD.extract, payload: HOP_PAYLOAD }, ledger: [] };

function hopStore(record = HOP_RECORD) {
  const store = createImportReviewStore({ client: { patch: async () => record } });
  store.open(record);
  for (const row of store.ledger.filter((line) => line.section === "hops")) {
    store.chooseRef(row.line_id, { id: `hop-${row.name}` });
  }
  return store;
}

test("authoring the split clears the gate that was solved without it", () => {
  const store = hopStore({ ...HOP_RECORD, extract: { ...HOP_RECORD.extract, payload: {
    ...HOP_PAYLOAD,
    hops: HOP_PAYLOAD.hops.map((hop) => { const copy = { ...hop }; delete copy.ibu_contribution; return copy; }),
  } } });
  store.gate = { findings: [{ code: "POOL_SPLIT_REQUIRED" }], blocking: [{}], advisory: [], revision: 0 };
  store.delta = { targets: [], lines: [] };

  store.setPoolFraction(0.2);
  assert.equal(store.gateState, "stale", "a changed decision makes the last solve stale");
  assert.ok(store.gate, "the last result is kept to say what changed");
  assert.equal(store.sectionState("hops").issues.length, 0, "the split closes the section");

  store.gate = { findings: [], blocking: [], advisory: [], revision: store.revision };
  assert.notEqual(store.gateState, "stale", "a re-run at the current revision is fresh again");
  store.changeDestination(store.ledger.find((row) => row.section === "hops").line_id, "batch.boil_hops");
  assert.equal(store.gateState, "stale", "and the same holds for a ledger decision");
});

test("printed per-addition IBUs give the split exactly", () => {
  const store = hopStore();
  assert.equal(store.printedPoolFraction, 8 / 60);
  assert.deepEqual(store.hopFindings, [], "a printed split needs no decision");
});

test("without printed IBUs the split is a section decision", () => {
  const unprinted = {
    ...HOP_PAYLOAD,
    hops: HOP_PAYLOAD.hops.map((hop) => {
      const copy = { ...hop };
      delete copy.ibu_contribution;
      return copy;
    }),
  };
  const store = hopStore({ ...HOP_RECORD, extract: { ...HOP_RECORD.extract, payload: unprinted } });
  assert.equal(store.printedPoolFraction, null);
  assert.equal(store.sectionState("hops").state, "open");
  assert.match(store.sectionState("hops").issues[0].message, /no IBU split/);
  assert.deepEqual(store.hopFindings.map((finding) => finding.code), [], "the section owns it now");
});

test("the estimate is offered, labelled, and bounded", () => {
  const store = hopStore();
  store.setPoolFraction(1.4, "authored");
  assert.equal(store.poolFraction, 1, "a share cannot exceed one");
  assert.equal(store.poolSource, "authored");
  store.useEstimatedPoolFraction();
  assert.equal(store.poolSource, "estimated");
  const estimate = store.poolFraction;
  assert.ok(estimate > 0 && estimate < 1);
});

test("a flameout left in the boil, and a hop longer than the boil, are flagged", () => {
  const payload = {
    ...HOP_PAYLOAD,
    targets: { ibu: HOP_PAYLOAD.targets.ibu, boil_time_min: { value: 15, unit: "min", verbatim: "15", page: 1 } },
    hops: [
      { name: "Flameout", quantity: { value: 1, unit: "oz" }, stage_guess: "boil", minutes: 0, verbatim: "0 min", page: 1 },
      { name: "Long", quantity: { value: 1, unit: "oz" }, stage_guess: "boil", minutes: 90, verbatim: "90 min", page: 1 },
    ],
  };
  const store = hopStore({ ...HOP_RECORD, extract: { ...HOP_RECORD.extract, payload } });
  for (const row of store.ledger.filter((line) => line.section === "hops")) {
    store.changeDestination(row.line_id, "batch.boil_hops");
  }
  const codes = store.hopFindings.map((finding) => finding.code);
  assert.ok(codes.includes("FLAMEOUT_IN_BOIL"));
  assert.ok(codes.includes("HOP_LONGER_THAN_BOIL"));
});


// --- the routing panes ----------------------------------------------------

test("hops are grouped by the pool they are going into, tagged by source order", () => {
  const store = hopStore();
  const panes = store.hopPanes;
  assert.deepEqual(panes.boil.map((row) => row.name), ["Citra"]);
  assert.deepEqual(panes.whirlpool.map((row) => row.name), ["Amarillo"]);
  assert.equal(panes.candidates.length, 0, "both hops have a stage");
  assert.deepEqual(panes.boil[0].tag, "#1 of 2", "the tag keeps the page order visible");
});

test("a hop can be swapped to the other pool without losing its ref", () => {
  const store = hopStore();
  const citra = store.hopPanes.boil[0];
  store.moveHop(citra.line_id, "batch.whirlpool_hops");
  assert.equal(store.hopPanes.whirlpool.length, 2);
  assert.equal(store.hopPanes.boil.length, 0);
  assert.equal(store.ledger.find((row) => row.line_id === citra.line_id).ref, `hop-${citra.name}`);
});

test("returning a hop to candidates withdraws the routing and the choice", () => {
  const store = hopStore();
  const citra = store.hopPanes.boil[0];
  store.returnHop(citra.line_id);
  assert.equal(store.hopPanes.candidates.length, 1);
  const row = store.ledger.find((candidate) => candidate.line_id === citra.line_id);
  assert.equal(row.destination, null);
  assert.equal(row.ref, null);
  assert.equal(row.decision, "unresolved");
});

test("a dry hop is decided by its hop, not by its pool", () => {
  const payload = {
    ...HOP_PAYLOAD,
    hops: [
      { name: "Motueka", quantity: { value: 2, unit: "oz" }, stage_guess: "dry_hop", verbatim: "2 oz Motueka", page: 2 },
      { name: "Nelson Sauvin", quantity: { value: 1, unit: "oz" }, stage_guess: "dry_hop", verbatim: "1 oz Nelson Sauvin", page: 2 },
    ],
  };
  const store = createImportReviewStore({ client: { patch: async () => HOP_RECORD } });
  store.open({ ...HOP_RECORD, extract: { ...HOP_RECORD.extract, payload } });
  const dry = store.hopPanes.dry;
  assert.equal(dry.length, 2, "a dry-hop stage is routed, not decided");
  assert.ok(dry.every((row) => store.isUndecided(row)), "no hop picked yet");

  store.chooseRef(dry[0].line_id, { id: "hop-motueka" });
  const updated = store.ledger.find((row) => row.line_id === dry[0].line_id);
  assert.equal(updated.destination, "batch.dry_hops", "picking a hop must not move it out of the dry pool");
  assert.equal(store.isUndecided(updated), false);
});

test("an ignored hop stays on the map, and undo clears its reason", () => {
  const payload = {
    ...HOP_PAYLOAD,
    hops: [{ name: "Motueka", quantity: { value: 2, unit: "oz" }, stage_guess: "dry_hop", verbatim: "2 oz", page: 2 }],
  };
  const store = createImportReviewStore({ client: { patch: async () => HOP_RECORD } });
  store.open({ ...HOP_RECORD, extract: { ...HOP_RECORD.extract, payload } });
  const line = store.hopPanes.dry[0];

  store.ignoreLine(line.line_id);
  assert.equal(store.hopPanes.ignored.length, 1, "an ignored hop is not silently dropped from the map");
  assert.equal(store.hopPanes.ignored[0].reason, "not modelled");
  assert.equal(store.hopPanes.dry.length, 0);
  assert.equal(store.isUndecided(store.hopPanes.ignored[0]), false);

  store.returnHop(line.line_id);
  assert.equal(store.hopPanes.candidates.length, 1);
  assert.equal(store.hopPanes.candidates[0].reason, "", "undoing the ignore does not leave the reason behind");
});

test("every hop pane offers the decision its rows need", () => {
  const page = read("frontend/src/partials/import-map.html");
  assert.match(page, /\{ id: 'dry', title: 'Dry hops'/, "dry hops are a pane, so they get the pane's controls");
  assert.match(page, /\{ id: 'boil'[^]*?\{ id: 'dry'/, "the dry pane is rendered by the same loop");
  assert.match(page, /hopPanes\.ignored/, "an ignored hop keeps a visible home");
  const pane = page.slice(page.indexOf("hop-panes"), page.indexOf("section.id !== 'hops'"));
  assert.match(pane, /chipsFor\(row\)/);
  assert.match(pane, /queryFor\(row\.line_id\)/, "the library search is reachable from a hop row");
});

test("the map offers a way back from an ignore, and no choice where there is none", () => {
  const page = read("frontend/src/partials/import-map.html");
  assert.match(page, /restoreLine\(row\.line_id\)/, "an ignored line can be put back");
  assert.match(
    page,
    /x-show="\$store\.importReview\.destinationsFor\(row\.section\)\.length > 1"/,
    "a select is only rendered when the section offers more than one destination"
  );
  assert.match(page, /destinationLabel\(row\)/);
});

test("an unknown stage starts in the candidates pane", () => {  const payload = {
    ...HOP_PAYLOAD,
    hops: [{ name: "Mystery", quantity: { value: 1, unit: "oz" }, stage_guess: "unknown", verbatim: "Mystery", page: 1 }],
  };
  const store = createImportReviewStore({ client: { patch: async () => HOP_RECORD } });
  store.open({ ...HOP_RECORD, extract: { ...HOP_RECORD.extract, payload } });
  assert.deepEqual(store.hopPanes.candidates.map((row) => row.name), ["Mystery"]);
});


// --- L2: the model's second opinion ---------------------------------------

test("the model's chips come first, and the local screen is the fallback", async () => {
  const calls = [];
  const store = createImportReviewStore({
    client: {
      patch: async () => HOP_RECORD,
      match: async (body) => {
        calls.push(body);
        return { items: [{ text: "Amarillo", picks: [{ id: "hop-Amarillo" }] }] };
      },
    },
    catalogs: () => [{ id: "hop-Amarillo", name: "Amarillo" }],
    catalog: (kind, id) => (id === "hop-Amarillo" ? { id, name: "Amarillo" } : null),
  });
  store.open(HOP_RECORD);
  await store.enrichSuggestions();
  const amarillo = store.ledger.find((row) => row.name === "Amarillo");
  assert.equal(store.chipsFor(amarillo)[0].source, "model");
  assert.equal(calls.length, 1, "one batched call per kind");
  assert.equal(calls[0].kind, "hop");
});

test("a failed match call leaves the local screen in charge and says so", async () => {
  const store = createImportReviewStore({
    client: {
      patch: async () => HOP_RECORD,
      match: async () => {
        throw new Error("provider down");
      },
    },
    catalogs: () => [{ id: "h", name: "Amarillo" }],
  });
  store.open(HOP_RECORD);
  assert.equal(await store.enrichSuggestions(), null);
  assert.equal(store.matchError, "provider down");
  assert.equal(store.chipsFor(store.ledger.find((row) => row.name === "Amarillo")).length, 1);
});

test("a line with no shortlist is not worth a call", async () => {
  const calls = [];
  const store = createImportReviewStore({
    client: {
      patch: async () => HOP_RECORD,
      match: async (body) => (calls.push(body), { items: [] }),
    },
    catalogs: () => [],
  });
  store.open(HOP_RECORD);
  await store.enrichSuggestions();
  assert.deepEqual(calls, []);
});

// --- commit ---------------------------------------------------------------

test("commit is refused until the gate is green", async () => {
  const commits = [];
  const store = createImportReviewStore({
    client: { patch: async () => RECORD },
    commit: async (args) => (commits.push(args), { id: "batch-1" }),
  });
  store.open(RECORD);
  assert.equal(await store.commit(), null);
  assert.match(store.checkError, /gate is not green/);
  assert.deepEqual(commits, []);
});

test("commit hands navigation to its command; close hands it to the seam", async () => {
  let closed = 0;
  const store = createImportReviewStore({
    client: { patch: async () => RECORD },
    commit: async () => ({ id: "batch-1" }),
    gate: async () => ({ findings: [], blocking: [], advisory: [], statuses: {}, engine: {} }),
    project: () => ({ roots: {}, collections: {}, selections: {} }),
    delta: () => ({ targets: [], lines: [] }),
    onClose: () => (closed += 1),
  });
  store.open({ ...RECORD, ledger: [{ line_id: "l", decision: "ignored", reason: "outside" }] });
  await store.runCheck();
  await store.commit();

  assert.equal(closed, 0, "a commit opens the batch it created, it does not return to the list");
  assert.equal(store.record, null, "the record is still cleared");

  store.open({ ...RECORD, ledger: [] });
  store.close();
  assert.equal(closed, 1, "closing the import returns to the seam");
});

test("a green gate commits the projected state and closes the record", async () => {
  const commits = [];
  const record = { ...RECORD, ledger: [{ line_id: "l", decision: "ignored", reason: "outside" }] };
  const store = createImportReviewStore({
    client: { patch: async () => record },
    commit: async (args) => (commits.push(args), { id: "batch-1" }),
    gate: async () => ({ findings: [], blocking: [], advisory: [], statuses: {}, engine: {} }),
    project: () => ({ roots: { "batch.target_og": 1.05 }, collections: {}, selections: {} }),
    delta: () => ({ lines: [], targets: [] }),
  });
  store.open(record);
  await store.runCheck();
  assert.equal(store.checkSummary.ok, true);
  const active = await store.commit();
  assert.equal(active.id, "batch-1");
  assert.equal(commits[0].name, "Duel Master Black IPA");
  assert.deepEqual(commits[0].state.roots, { "batch.target_og": 1.05 });
  assert.equal(store.record, null, "the record is closed after commit");
});

// --- gap fill: one more pass, absent-only --------------------------------

test("a re-read may only fill what is absent", async () => {
  const calls = [];
  const payload = {
    ...HOP_PAYLOAD,
    targets: { og: { value: 1.078, unit: "sg", verbatim: "OG", page: 1 } },
  };
  const record = { ...RECORD, extract: { ...RECORD.extract, payload }, ledger: [] };
  const store = createImportReviewStore({
    client: {
      patch: async () => record,
      gapfill: async (body) => {
        calls.push(body.request.missing);
        return {
          volume: { value: 20, unit: "l", verbatim: "20 L", page: 2 },
          og: { value: 1.2, unit: "sg", verbatim: "OG", page: 2 },
        };
      },
    },
    sourceFile: () => ({ name: "page.pdf" }),
    readFile: async () => "base64",
  });
  store.open(record);
  assert.deepEqual(store.missingNames, ["volume", "ibu"], "OG is already stated");

  await store.askForMissing();
  assert.deepEqual(calls, [["volume", "ibu"]], "only what is missing is asked for");
  assert.equal(store.payload.targets.volume.value, 20);
  assert.equal(store.payload.targets.og.value, 1.078, "a stated value is never overwritten");
  assert.equal(store.payload.targets.volume.source, "llm");
  assert.equal(store.dirty, true);
});

test("without the document in memory the action says so instead of calling", async () => {
  const calls = [];
  const store = createImportReviewStore({
    client: { patch: async () => RECORD, gapfill: async (body) => (calls.push(body), {}) },
    sourceFile: () => null,
  });
  store.open({ ...RECORD, extract: { ...RECORD.extract, payload: { ...HOP_PAYLOAD, targets: {} } } });
  await store.askForMissing();
  assert.deepEqual(calls, []);
  assert.match(store.error, /no longer in memory/);
});

// --- unresolved lines and the single-yeast limit -------------------------

test("the check screen can name what is holding the gate shut", () => {
  const payload = {
    ...HOP_PAYLOAD,
    yeasts: [
      { name: "clean saison strain", verbatim: "clean saison strain", page: 4 },
      { name: "Brettanomyces culture", verbatim: "Brett", page: 4 },
    ],
  };
  const record = { ...RECORD, extract: { ...RECORD.extract, payload }, ledger: [] };
  const store = createImportReviewStore({ client: { patch: async () => record } });
  store.open(record);
  const names = store.unresolved.map((row) => row.name);
  assert.ok(names.includes("clean saison strain"));
  assert.ok(names.includes("Brettanomyces culture"));
});

test("two picked strains ask the section for a carrier, and picking one closes it", () => {
  const { store } = twoYeasts();
  assert.equal(store.mappedYeasts.length, 2, "both strains are picked");
  assert.equal(store.yeastOutcome, null, "nothing chooses the batch's yeast yet");
  assert.equal(store.carrierLineId, null);
  assert.equal(store.yeastSectionOpen, true);
  assert.equal(store.sectionIssues.length, 1);
  assert.match(store.sectionIssues[0].message, /choose the strain it takes/);

  const brett = store.ledger.find((row) => row.name === "Brettanomyces culture");
  store.gate = { findings: [], blocking: [], advisory: [] };
  store.setCarrier(brett.line_id);

  assert.deepEqual(store.yeastOutcome, { mode: "single", line_id: brett.line_id });
  assert.equal(store.carrierLineId, brett.line_id);
  assert.equal(store.yeastSectionOpen, false);
  assert.deepEqual(store.sectionIssues, [], "choosing a carrier closes the section");
  assert.equal(store.gateState, "stale", "the gate is stale once the decision moves");

  const saison = store.ledger.find((row) => row.name === "clean saison strain");
  assert.equal(saison.decision, "mapped", "the other strain stays picked, not ignored");
  assert.equal(store.isUndecided(saison), false);
});

test("one picked strain is the carrier without asking", () => {
  const { store } = unpickedTwoYeasts();
  const brett = store.ledger.find((row) => row.name === "Brettanomyces culture");
  store.chooseRef(brett.line_id, { id: "brett", name: "Brett Brux" });
  assert.deepEqual(store.yeastOutcome, { mode: "single", line_id: brett.line_id });
  assert.equal(store.yeastSectionOpen, false);
});

test("a left-out carrier does not linger", () => {
  const { store } = twoYeasts();
  const brett = store.ledger.find((row) => row.name === "Brettanomyces culture");
  store.setCarrier(brett.line_id);
  store.ignoreLine(brett.line_id, "not this beer");

  assert.notEqual(store.carrierLineId, brett.line_id, "the left-out strain cannot carry the batch");
  assert.equal(store.yeastSectionOpen, false, "one picked strain remains, so it is the carrier");
});

test("a blend record is picked like any other yeast", () => {
  const { store } = unpickedTwoYeasts();
  const line = store.ledger.find((row) => row.name === "clean saison strain");
  store.chooseRef(line.line_id, { id: "blend-1", name: "Blend: Saison + Brett" });

  assert.equal(store.refLabel(store.ledger.find((row) => row.line_id === line.line_id)), "Blend: Saison + Brett");
  assert.deepEqual(store.yeastOutcome, { mode: "single", line_id: line.line_id });
  assert.equal(store.yeastSectionOpen, false);
});


test("a multi-strain recipe proposes blends, and one pick documents the components", () => {
  const { store, records } = unpickedTwoYeasts();
  records.set("blend-1", {
    id: "blend-1",
    name: "Blend: Saison + Brett",
    blend_of: "clean saison strain, Brettanomyces culture",
    attenuation_pct: 0.78,
  });
  records.set("strain-x", { id: "strain-x", name: "clean saison strain" });

  const [saison, brett] = store.yeastLines;
  const chips = store.chipsFor(saison);
  assert.deepEqual(chips.map((chip) => chip.id), ["blend-1"], "blends, not the components");
  assert.equal(chips[0].composition, "clean saison strain, Brettanomyces culture");

  store.chooseRef(saison.line_id, chips[0]);
  const documented = store.ledger.find((row) => row.line_id === brett.line_id);
  assert.equal(documented.decision, "ignored");
  assert.equal(documented.reason, "represented by Blend: Saison + Brett");
  assert.equal(store.carrierLineId, saison.line_id);
  assert.deepEqual(store.sectionIssues, [], "one blend pick decides the section");
});

test("without a blend record the strain chips remain the fallback", () => {
  const { store, records } = unpickedTwoYeasts();
  records.set("strain-x", { id: "strain-x", name: "clean saison strain" });
  records.set("strain-y", { id: "strain-y", name: "Brettanomyces culture" });

  assert.equal(store.blendRecords.length, 0);
  const chips = store.chipsFor(store.yeastLines[0]);
  assert.ok(chips.length > 0, "the user is not blocked by a missing blend");
  assert.ok(chips.every((chip) => !chip.blend), "and the chips are strains, not blends");
});

test("a picked record is shown by name, and a deleted one says so on the row", () => {
  const records = new Map([["y-1", { id: "y-1", name: "House strain" }]]);
  const store = createImportReviewStore({
    client: { patch: async () => RECORD },
    catalog: (kind, id) => records.get(id) ?? null,
  });
  store.open({ ...RECORD, extract: { ...RECORD.extract, payload: HOP_PAYLOAD }, ledger: [] });
  const line = store.ledger.find((row) => row.section === "yeasts");
  store.chooseRef(line.line_id, { id: "y-1", name: "House strain" });

  const picked = store.ledger.find((row) => row.line_id === line.line_id);
  assert.equal(store.refLabel(picked), "House strain", "the row reads as a name, never an id");
  assert.equal(store.rowIssue(picked), "");

  records.delete("y-1");
  const orphan = store.ledger.find((row) => row.line_id === line.line_id);
  assert.equal(store.refLabel(orphan), "House strain", "the name is remembered with the pick");
  const legacy = { ...orphan, ref_name: null };
  assert.equal(store.refLabel(legacy), legacy.name, "a name-less pick falls back to the recipe's words");
  assert.match(store.rowIssue(orphan), /was deleted/);
  assert.equal(store.isUndecided(orphan), true);
});

test("an undecided section blocks the gate and the forward press", async () => {
  const { store } = twoYeasts();
  store.goTo("map");
  assert.equal(store.sectionIssues.length, 1);

  // The check cannot be green while the section is open.
  const gate = {
    findings: [],
    blocking: [],
    advisory: [],
    statuses: {},
    engine: {},
  };
  store.gate = { ...gate, revision: store.revision };
  assert.equal(store.checkSummary.ok, false);
  assert.equal(store.checkSummary.sections, 1);

  // And the map does not advance.
  await store.saveAndAdvance();
  assert.equal(store.stage, "map");
});

test("the provenance panel states the imported recipe and the yeast outcome", () => {
  const record = {
    ...RECORD,
    ledger: [
      { line_id: "yeasts[0]", section: "yeasts", name: "clean saison strain", ref_name: "Saison I", decision: "mapped" },
      { line_id: "yeasts[1]", section: "yeasts", name: "Brettanomyces culture", ref_name: "Brett blend", decision: "ignored" },
    ],
    yeast_outcome: { mode: "single", line_id: "yeasts[0]" },
  };
  assert.equal(
    originYeastOutcome(record),
    "Imported recipe named 2 strains; this batch ferments with Saison I."
  );
  assert.equal(originYeastOutcome({ ...RECORD, ledger: [] }), "");
  assert.equal(originTitle(record), "Duel Master Black IPA");
});

// A store holding the two-strain recipe, with neither strain mapped yet.
function unpickedTwoYeasts() {
  const payload = {
    ...HOP_PAYLOAD,
    yeasts: [
      { name: "clean saison strain", verbatim: "clean saison strain", page: 4 },
      { name: "Brettanomyces culture", verbatim: "Brett", page: 4 },
    ],
  };
  const record = { ...RECORD, extract: { ...RECORD.extract, payload }, ledger: [] };
  const records = new Map();
  const store = createImportReviewStore({
    client: { patch: async (id, body) => ({ ...record, ...body }) },
    catalog: (kind, id) => records.get(id) ?? null,
    catalogs: () => [...records.values()],
  });
  store.open(record);
  return { store, records };
}

// The same recipe with both strains pointed at their own records.
function twoYeasts() {
  const helpers = unpickedTwoYeasts();
  for (const row of helpers.store.ledger.filter((line) => line.section === "yeasts")) {
    const id = `line-${row.name}`;
    helpers.records.set(id, { id, name: row.name });
    helpers.store.chooseRef(row.line_id, { id, name: row.name });
  }
  return helpers;
}


test("the yeasts section asks for the carrier and offers no blend control", () => {
  const map = read("frontend/src/partials/import-map.html");
  assert.match(map, /This batch ferments with/);
  assert.match(map, /A blend record covers them together/);
  assert.match(map, /no blend record exists yet/);
  assert.match(map, /chip\.composition/);
  assert.match(map, /setCarrier\(\$event\.target\.value\)/);
  assert.match(map, /carrierLineId/);
  assert.match(map, /not the batch's yeast/);
  assert.doesNotMatch(map, /Blend both/);
  assert.doesNotMatch(map, /saveBlend/);
  assert.doesNotMatch(map, /openBlend/);
});

test("the editor shows where the batch came from", () => {
  const editor = read("frontend/src/partials/editor.html");
  assert.match(editor, /Imported from/);
  assert.match(editor, /originOf\(\$store\.recipes\.activeId\)/);
  assert.match(editor, /src\/partials\/import-delta\.html/);
});

test("the map and the check speak one vocabulary: pick, leave out, add back", () => {
  const map = read("frontend/src/partials/import-map.html");
  const check = read("frontend/src/partials/import-check.html");
  assert.match(map, />Leave out</);
  assert.match(map, />Add back</);
  assert.doesNotMatch(map, />Ignore</);
  assert.doesNotMatch(map, />Put back</);
  assert.match(map, /This batch ferments with/, "the carrier is one labelled choice");
  assert.match(map, /refLabel\(row\)/, "a picked record is named, never shown as an id");
  assert.match(map, /rowIssue\(row\)/, "the row carries what it needs");
  assert.match(check, /rowIssue\(row\)/);
  assert.doesNotMatch(map, /ledgerFindings/, "row-level problems are not restated in a strip");
});


// --- water: the profile is the user's constraint -------------------------

const PROFILE = {
  value: "balanced",
  label: "Balanced",
  record: { id: "balanced", name: "Balanced", calcium_ca: 60, sulfate_so4: 80, chloride_cl: 60 },
};

test("choosing a target profile stores it and invalidates the last check", () => {
  const store = createImportReviewStore({
    client: { patch: async () => RECORD },
    profiles: () => [PROFILE],
  });
  store.open(RECORD);
  store.gate = { blocking: [], advisory: [], findings: [], engine: null };
  store.setTargetProfile("balanced");
  assert.equal(store.targetProfileId, "balanced");
  assert.equal(store.targetProfile.id, "balanced");
  assert.equal(store.targetProfile.sulfate_so4, 80, "the record travels, not just the id");
  assert.equal(store.gateState, "stale", "a stale check says so instead of vanishing");
  assert.equal(store.dirty, true);
});

test("the projection seeds the profile as a selection and its ref root", async () => {
  const { projectImport } = await import("../../frontend/src/adapters/importProjection.js");
  const state = projectImport({
    payload: HOP_PAYLOAD,
    ledger: [{ line_id: "hops[0]", decision: "ignored", reason: "x", section: "hops" }],
    targetProfile: { id: "balanced", name: "Balanced", sulfate_so4: 80 },
    catalog: () => null,
  });
  assert.equal(state.selections["water.target_profile"].name, "Balanced");
  assert.equal(state.roots["water.target_profile_id"], "balanced");
});

test("the water summary is whatever the gate reported, and absent when water was skipped", () => {
  const store = createImportReviewStore({ client: { patch: async () => RECORD } });
  store.open(RECORD);
  assert.equal(store.waterSummary, null, "no check yet, nothing solved");
  store.gate = { engine: null, water: { ph: 5.32, gypsum_g: 4 } };
  assert.equal(store.waterSummary.ph, 5.32);
  store.gate = { engine: null, water: null };
  assert.equal(store.waterSummary, null, "a skipped boundary is absence, not zero");
});

test("composing the store does not run its getters", () => {
  let called = false;
  const store = createImportReviewStore({
    client: { patch: async () => RECORD },
    profiles: () => {
      called = true;
      throw new Error("profiles read at boot");
    },
  });
  assert.equal(called, false, "a getter must not run during composition");
  assert.ok(store, "the store exists");
  // It runs when read, which is the point.
  assert.throws(() => store.targetProfiles, /profiles read at boot/);
});
