// Step view composition: evaluates the producer for every step, indexes
// violations onto their owning slices, and refreshes the card readouts. The
// refresh order is the `CARD_REFRESHES` list below, not the call order in
// `compute`: adding a card is one entry plus its export.
//
// Every refresh receives one frozen per-pass state built in `compute` (live
// engine, catalogue, unit store, artifact, the produced field index, and the
// boundary mirrors) instead of the install-time context. A card that needs a
// mirror another card produced passes it explicitly at its own call site.

import { createFindingFormatter, produce } from "../views/producer.js";
import { indexFields } from "../utils.js";
import { createObservabilityManager } from "../observability.js";
import { dimensionOf } from "../views/registry/catalog.js";
import {
  findingFor,
  findingOperands,
  hostFinding,
} from "../views/registry/findings.js";
import { refreshYeastCard } from "./cards/yeast.js";
import { refreshStyleCard } from "./cards/style.js";
import { refreshHopCard } from "./cards/hops.js";
import { refreshLateAdditionsCard } from "./cards/late-additions.js";
import { refreshTraceMaltsCard } from "./cards/trace-malts.js";
import { refreshMaltCard } from "./cards/malt.js";
import { refreshMashCard } from "./cards/mash.js";
import { refreshBrewDayCard } from "./cards/brew-day.js";
import { refreshDryHopCard } from "./cards/dry-hops.js";
import { refreshWaterCard } from "./cards/water.js";

// The order is the contract: the yeast card owns the attenuation readouts the
// style card quotes, and both run before the cards that read their solved
// snapshots. Each entry is a pure refresh over the state `compute` hands down.
export const CARD_REFRESHES = [
  { card: "yeast", refresh: refreshYeastCard },
  { card: "style", refresh: refreshStyleCard },
  { card: "malt", refresh: refreshMaltCard },
  { card: "traceMalts", refresh: refreshTraceMaltsCard },
  { card: "hop", refresh: refreshHopCard },
  { card: "lateAdditions", refresh: refreshLateAdditionsCard, after: ["style"] },
  { card: "mash", refresh: refreshMashCard },
  { card: "brewDay", refresh: refreshBrewDayCard },
  { card: "dryHops", refresh: refreshDryHopCard },
  { card: "water", refresh: refreshWaterCard },
];

export function createStepView({
  artifact,
  steps,
  registry,
  cache,
  ui,
  session,
  observability = createObservabilityManager(),
  relationDefs,
  attribution,
}) {
  const { fieldSlice, selectionSlice, relationSlices } = attribution;

  function safe(fn) {
    try {
      return fn();
    } catch (err) {
      observability.reportError("stepView.safe", err);
      return [];
    }
  }

  function readOperand(engine, path) {
    let value;
    try {
      value = engine.resolve(path);
    } catch (err) {
      observability.reportError("stepView.findingOperand", err);
      value = undefined;
    }
    return { value, dimension: dimensionOf(artifact, path) };
  }

  function readConstant(name) {
    const spec = artifact.constants?.[name];
    return { value: spec?.value, dimension: spec?.dimension ?? null };
  }

  function computeFindings(engine, relations) {
    const formatOperand = createFindingFormatter(artifact, engine, ui);
    const read = (path) => readOperand(engine, path);
    const findings = (relations ?? [])
      .filter((relation) => relation.holds === false)
      .map((relation) =>
        findingFor(
          relation,
          findingOperands(relation.id, read, readConstant),
          formatOperand
        )
      )
      .filter(Boolean);

    // Unknown STA1 is never silent: no vendor result means d = 0, with a
    // visible advisory. A selected strain without a QC field is the same case.
    let yeastId;
    let sta1;
    try {
      yeastId = engine.get("batch.yeast_id");
      sta1 = engine.resolve("batch.yeast.sta1");
    } catch (err) {
      observability.reportError("stepView.sta1Advisory", err);
      yeastId = "";
      sta1 = null;
    }
    if (yeastId && sta1 == null) {
      const advisory = hostFinding("sta1_unknown");
      if (advisory) findings.push(advisory);
    }

    // A share without sugar is an authored intent the solver cannot honor, and
    // a very high share nearly empties the malt target. Both are advisories:
    // they describe the authored state, not a boundary failure.
    let intent;
    let sugarShare;
    let sugars;
    try {
      intent = engine.get("batch.late_addition_intent");
      sugarShare = engine.get("batch.sugar_extract_share");
      sugars = engine.get("batch.sugars");
    } catch (err) {
      observability.reportError("stepView.sugarShareAdvisory", err);
      intent = "dose";
      sugarShare = 0;
      sugars = [];
    }
    if (intent === "share" && typeof sugarShare === "number") {
      if (sugarShare > 0 && (sugars ?? []).length === 0) {
        const advisory = hostFinding("sugar_share_without_sugar");
        if (advisory) findings.push(advisory);
      }
      if (sugarShare > 0.9) {
        const advisory = hostFinding("sugar_share_high");
        if (advisory) findings.push(advisory);
      }
    }

    return findings;
  }

  function produceFields(app, engine, conformance) {
    const fieldDomains = safe(() => engine.fieldDomainStates());
    const fieldDomainIndex = {};
    for (const d of fieldDomains) {
      const owner = d.namespace ?? d.selectionNodeId;
      fieldDomainIndex[`${owner}.${d.field}`] = d;
    }

    const collectionDomains = safe(() => engine.collectionDomainStates());
    const collectionIndex = {};
    for (const d of collectionDomains) {
      (collectionIndex[d.nodeId] ??= {});
      (collectionIndex[d.nodeId][d.index] ??= {});
      collectionIndex[d.nodeId][d.index][d.field] = d;
    }

    app.styleConformance = conformance;
    app.styleSai = conformance?.sai ?? null;

    let topology;
    try {
      topology = engine.get("batch.topology");
    } catch (err) {
      observability.reportError("stepView.topology", err);
      topology = undefined;
    }

    const all = produce(artifact, steps, registry, engine, {
      references: cache.references,
      ui,
      topology,
      fieldDomains: fieldDomainIndex,
      collectionDomains: collectionIndex,
      conformance,
      reportError: observability.reportError,
    });
    app.fieldsBySlice = Object.fromEntries(
      steps.map((s) => [s.slice, all.filter((f) => f.slice === s.slice)])
    );
    app.fieldsById = indexFields(all);
    app.relations = safe(() => engine.relationStates());
    app.findings = computeFindings(engine, app.relations);
    app.findingsById = Object.fromEntries(
      app.findings.map((finding) => [finding.id, finding])
    );
    app.pinFindingAvailable =
      app.boundaryStatuses?.["solver.batch"] === "ok" && topology === "runoff_ratio";
    app.domains = safe(() => engine.domainStates());
    app.fieldDomains = fieldDomains;
    app.collectionDomains = collectionDomains;
  }

  function indexStatus(app) {
    app.violationCount =
      app.relations.filter((r) => r.holds === false).length +
      app.domains.filter((d) => d.holds === false).length +
      app.fieldDomains.filter((d) => d.holds === false).length +
      app.collectionDomains.filter((d) => d.holds === false).length;

    app.stepStatus = {};
    for (const step of steps) app.stepStatus[step.slice] = { relations: [], domains: [] };
    for (const r of app.relations) {
      if (r.holds !== false) continue;
      for (const slice of relationSlices(relationDefs[r.id]?.predicate)) {
        app.stepStatus[slice]?.relations.push(r);
      }
    }
    for (const d of app.domains) {
      if (d.holds !== false) continue;
      app.stepStatus[d.nodeId.split(".")[0]]?.domains.push(d);
    }
    for (const d of app.fieldDomains) {
      if (d.holds !== false) continue;
      const path = `${d.namespace ?? d.selectionNodeId}.${d.field}`;
      const slice = fieldSlice.get(path) ?? selectionSlice.get(d.namespace ?? d.selectionNodeId);
      app.stepStatus[slice]?.domains.push(d);
    }
    for (const d of app.collectionDomains) {
      if (d.holds !== false) continue;
      app.stepStatus[fieldSlice.get(d.nodeId)]?.domains.push(d);
    }
  }

  // The explicit state one refresh pass hands to every card. Frozen so a
  // refresher cannot rewrite the pipeline inputs mid-order.
  function refreshState(engine, app) {
    return Object.freeze({
      engine,
      cache,
      ui,
      artifact,
      observability,
      fieldsById: app.fieldsById,
      boundaryStatuses: app.boundaryStatuses ?? {},
      boundaryExtras: app.boundaryExtras ?? {},
      waterTelemetry: app.boundaryExtras?.["solver.water"] ?? null,
      boundaryPending: app.boundaryPending === true,
      boundaryError: app.boundaryError ?? null,
    });
  }

  function refreshCards(app, state) {
    const produced = {};
    for (const { card, refresh, after = [] } of CARD_REFRESHES) {
      for (const dependency of after) {
        if (!(dependency in produced)) {
          throw new Error(
            `card refresh order: "${card}" requires "${dependency}" to refresh first`
          );
        }
      }
      const value = refresh(app, { ...state, produced });
      if (value) produced[card] = value;
    }
  }

  function compute(app) {
    const engine = session.getEngine();
    // The conformance verdict is an explicit pre-produce step: the producer and
    // the conformance card read the same local, never the card method mid-pass.
    const conformance = app.styleConformanceReport?.() ?? null;
    produceFields(app, engine, conformance);
    indexStatus(app);
    refreshCards(app, refreshState(engine, app));
  }


  return { compute };
}
