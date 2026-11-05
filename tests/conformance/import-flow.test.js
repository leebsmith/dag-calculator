// Acceptance flows for the mapping phase. Each one drives the store, the projection
// and a stub gate through a path a person walks, and asserts the derived state rather
// than an internal detail. A regression must fail one of these, not start a new round
// of report-driven patches.

import test from "node:test";
import assert from "node:assert/strict";

import { projectImport } from "../../frontend/src/adapters/importProjection.js";
import { createImportReviewStore } from "../../frontend/src/store/importReview.js";

const CATALOG = {
  malt: {
    pale: {
      id: "pale",
      name: "Pale Malt",
      yield_fraction: 0.8,
      fermentability_fraction: 0.8,
      color_lovibond: 2,
      moisture_fraction: 0.04,
      category: "base",
    },
  },
  hop: {
    saaz: { id: "saaz", name: "Saaz", alpha_acid_pct: 3.2, product_form: "t90_pellet" },
  },
  yeast: {
    "strain-a": { id: "strain-a", name: "Strain A", attenuation_pct: 0.8 },
    "strain-b": { id: "strain-b", name: "Strain B", attenuation_pct: 0.75 },
    "blend-1": {
      id: "blend-1",
      name: "Blend: A + B",
      attenuation_pct: 0.78,
      blend_of: "Strain A, Strain B",
    },
  },
};

const catalog = (kind, id) => CATALOG[kind]?.[id] ?? null;

function payload({ yeasts = ["Strain A"], hops = [{ stage: "boil", minutes: 60 }] } = {}) {
  return {
    title: "Flow",
    targets: {
      volume: { value: 23, unit: "l" },
      og: { value: 1.052, unit: "sg" },
      ibu: { value: 30, unit: "ibu" },
      boil_time_min: { value: 60, unit: "min" },
    },
    fermentables: [
      { name: "Pale Malt", quantity: { value: 5, unit: "kg" }, kind_hint: "malt", verbatim: "5 kg", page: 1 },
    ],
    hops: hops.map((hop, index) => ({
      name: "Saaz",
      quantity: { value: 50, unit: "g" },
      stage_guess: hop.stage,
      minutes: hop.minutes,
      alpha_acid_pct: 3.2,
      verbatim: `Saaz ${index}`,
      page: 1,
    })),
    yeasts: yeasts.map((name) => ({ name, verbatim: name, page: 2 })),
    mashes: [],
    unmodeled: [],
    warnings: [],
  };
}

function recordFor(body) {
  return {
    id: "imp-1",
    status: "mapping",
    identity: null,
    extract: {
      source: { filename: "flow.pdf", page_count: 1, model: "m", prompt_version: 1, extracted_at: "t" },
      payload: body,
    },
    ledger: [],
    suggestions: [],
    batch_id: null,
  };
}

function flow(options = {}) {
  const record = recordFor(payload(options));
  const patches = [];
  const closes = [];
  const store = createImportReviewStore({
    client: { patch: async (id, body) => (patches.push(body), { ...record, ...body }) },
    catalog,
    catalogs: () => Object.values(CATALOG.yeast),
    project: projectImport,
    gate: async () => ({ findings: [], blocking: [], advisory: [], statuses: {}, engine: {} }),
    delta: () => ({ targets: [], lines: [] }),
    commit: async () => ({ id: "batch-1" }),
    onClose: () => closes.push("closed"),
  });
  store.open(record);
  for (const row of store.ledger.filter((line) => line.section === "fermentables")) {
    store.chooseRef(row.line_id, { id: "pale", name: "Pale Malt" });
  }
  for (const row of store.ledger.filter((line) => line.section === "hops")) {
    store.chooseRef(row.line_id, { id: "saaz", name: "Saaz" });
  }
  return { store, patches, closes };
}

const yeastRow = (store, name) => store.ledger.find((row) => row.name === name);

test("1. one strain, picked: it is the batch's yeast and the projection carries it", async () => {
  const { store } = flow({ yeasts: ["Strain A"] });
  const line = yeastRow(store, "Strain A");
  store.chooseRef(line.line_id, { id: "strain-a", name: "Strain A" });

  assert.equal(store.yeastSectionOpen, false, "one strain needs no choice");
  assert.deepEqual(store.yeastOutcome, { mode: "single", line_id: line.line_id });

  await store.runCheck();
  assert.equal(store.checkSummary?.ok, true);
  assert.equal(store.projectedState.roots["batch.yeast_id"], "strain-a");
  assert.equal(store.projectedState.selections["batch.yeast"].name, "Strain A");
});

test("2. two strains, picked: the section asks for the carrier and closes on the choice", () => {
  const { store } = flow({ yeasts: ["Strain A", "Strain B"] });
  store.chooseRef(yeastRow(store, "Strain A").line_id, { id: "strain-a", name: "Strain A" });
  store.chooseRef(yeastRow(store, "Strain B").line_id, { id: "strain-b", name: "Strain B" });

  assert.equal(store.yeastSectionOpen, true);
  assert.equal(store.sectionIssues.length, 1);

  const b = yeastRow(store, "Strain B");
  store.setCarrier(b.line_id);
  assert.equal(store.yeastSectionOpen, false);
  assert.equal(store.carrierLineId, b.line_id);
  assert.equal(yeastRow(store, "Strain A").ref, "strain-a", "the other strain stays picked");
});

test("3. a blend record is picked and carried like any yeast", async () => {
  const { store } = flow({ yeasts: ["Strain A"] });
  const line = yeastRow(store, "Strain A");
  store.chooseRef(line.line_id, { id: "blend-1", name: "Blend: A + B" });

  await store.runCheck();
  assert.equal(store.projectedState.roots["batch.yeast_id"], "blend-1");
  assert.equal(store.projectedState.selections["batch.yeast"].attenuation_pct, 0.78);
  assert.equal(store.checkSummary?.ok, true);
});

test("3b. a multi-strain recipe picks one blend and documents the components", async () => {
  const { store } = flow({ yeasts: ["Strain A", "Strain B"] });
  const [first, second] = store.yeastLines;

  assert.equal(store.blendMode, true);
  assert.deepEqual(store.chipsFor(first), [], "the rows do not offer their own choices");
  const chips = store.blendCandidates();
  assert.deepEqual(chips.map((chip) => chip.id), ["blend-1"], "blends are the candidates");
  assert.equal(store.unresolved.length, 0, "components do not block; the section does");
  assert.equal(store.sectionIssues.length, 1);

  store.chooseBlend(chips[0]);
  assert.equal(
    store.ledger.find((row) => row.line_id === second.line_id).reason,
    "represented by Blend: A + B",
    "the other strain is documented, not blocking"
  );
  assert.equal(store.yeastSectionOpen, false);

  await store.runCheck();
  assert.equal(store.projectedState.roots["batch.yeast_id"], "blend-1");
  assert.equal(store.projectedState.selections["batch.yeast"].name, "Blend: A + B");
});

test("4. a deleted pick is broken and holds the gate shut", async () => {
  const { store } = flow({ yeasts: ["Strain A"] });
  const line = yeastRow(store, "Strain A");
  store.chooseRef(line.line_id, { id: "strain-a", name: "Strain A" });

  delete CATALOG.yeast["strain-a"];
  const broken = store.ledger.find((row) => row.line_id === line.line_id);
  assert.equal(store.rowState(broken).state, "broken");
  assert.match(store.rowState(broken).message, /was deleted/);
  assert.equal(store.unresolved.some((row) => row.line_id === line.line_id), true);

  await store.runCheck();
  assert.equal(store.checkSummary?.ok, false, "the gate refuses a broken mapping");
  CATALOG.yeast["strain-a"] = { id: "strain-a", name: "Strain A", attenuation_pct: 0.8 };
});

test("5. a whirlpool charge without a split opens the hops section", () => {
  const { store } = flow({ hops: [{ stage: "boil", minutes: 60 }, { stage: "whirlpool", minutes: 20 }] });
  assert.equal(store.sectionState("hops").state, "open");
  assert.match(store.sectionState("hops").issues[0].message, /no IBU split/);

  store.setPoolFraction(0.2);
  assert.equal(store.sectionState("hops").state, "decided");
});

test("6. a decision after a check makes the result stale, not absent", async () => {
  const { store } = flow({ yeasts: ["Strain A"] });
  store.chooseRef(yeastRow(store, "Strain A").line_id, { id: "strain-a", name: "Strain A" });
  await store.runCheck();
  assert.equal(store.gateState, "fresh-ok");

  store.setPoolFraction(0.3);
  assert.equal(store.gateState, "stale");
  assert.ok(store.gate, "the last result is kept");
  assert.equal(store.checkSummary, null, "and is not presented as current");
});

test("7. commit clears the record but leaves navigation to the commit command", async () => {
  const { store, closes } = flow({ yeasts: ["Strain A"] });
  store.chooseRef(yeastRow(store, "Strain A").line_id, { id: "strain-a", name: "Strain A" });
  await store.runCheck();
  const active = await store.commit();
  assert.equal(active.id, "batch-1");
  assert.equal(store.record, null, "the import view closes on its own record");
  assert.deepEqual(closes, [], "no return to the list: the new batch is where the user lands");
});
