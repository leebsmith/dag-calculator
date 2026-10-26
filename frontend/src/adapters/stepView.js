// Step view composition: evaluates the producer for every step, indexes
// violations onto their owning slices, and refreshes the card readouts.

import { createFindingFormatter, produce } from "../views/producer.js";
import { indexFields } from "../utils.js";
import { reportError } from "../observability.js";
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
import { refreshWaterCard } from "./cards/water.js";

export function createStepView({
  artifact,
  steps,
  registry,
  cache,
  ui,
  session,
  cardCtx,
  relationDefs,
  attribution,
}) {
  const { fieldSlice, selectionSlice, relationSlices } = attribution;

  function safe(fn) {
    try {
      return fn();
    } catch (err) {
      reportError("stepView.safe", err);
      return [];
    }
  }

  function readOperand(engine, path) {
    let value;
    try {
      value = engine.resolve(path);
    } catch (err) {
      reportError("stepView.findingOperand", err);
      value = undefined;
    }
    return { value, dimension: dimensionOf(artifact, path) };
  }

  function readConstant(name) {
    const spec = artifact.constants?.[name];
    return { value: spec?.value, dimension: spec?.dimension ?? null };
  }

  function readConstant(name) {
    const spec = artifact.constants?.[name];
    return { value: spec?.value, dimension: spec?.dimension ?? null };
  }

  function computeFindings(engine, relations) {
    const formatOperand = createFindingFormatter(artifact, engine, ui);
    const read = (path) => readOperand(engine, path);
    const findings = (relations ?? [])
      .filter((relation) => !relation.holds)
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
      reportError("stepView.sta1Advisory", err);
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
      reportError("stepView.sugarShareAdvisory", err);
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

  function compute(app) {
    const engine = session.getEngine();
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

    app.styleConformance = app.styleConformanceReport?.() ?? null;
    app.styleSai = app.styleConformance?.sai ?? null;

    const all = produce(artifact, steps, registry, engine, {
      references: cache.references,
      ui,
      fieldDomains: fieldDomainIndex,
      collectionDomains: collectionIndex,
      conformance: app.styleConformance,
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
    let topology;
    try {
      topology = engine.get("batch.topology");
    } catch (err) {
      reportError("stepView.findingTopology", err);
      topology = undefined;
    }
    app.pinFindingAvailable =
      app.boundaryStatuses?.["solver.batch"] === "ok" && topology === "runoff_ratio";
    app.domains = safe(() => engine.domainStates());
    app.fieldDomains = fieldDomains;
    app.collectionDomains = collectionDomains;
    refreshYeastCard(app, cardCtx);
    refreshStyleCard(app, cardCtx);
    app.violationCount =
      app.relations.filter((r) => !r.holds).length +
      app.domains.filter((d) => d.holds === false).length +
      fieldDomains.filter((d) => d.holds === false).length +
      collectionDomains.filter((d) => d.holds === false).length;

    app.stepStatus = {};
    for (const step of steps) app.stepStatus[step.slice] = { relations: [], domains: [] };
    for (const r of app.relations) {
      if (r.holds) continue;
      for (const slice of relationSlices(relationDefs[r.id]?.predicate)) {
        app.stepStatus[slice]?.relations.push(r);
      }
    }
    for (const d of app.domains) {
      if (d.holds !== false) continue;
      app.stepStatus[d.nodeId.split(".")[0]]?.domains.push(d);
    }
    for (const d of fieldDomains) {
      if (d.holds !== false) continue;
      const path = `${d.namespace ?? d.selectionNodeId}.${d.field}`;
      const slice = fieldSlice.get(path) ?? selectionSlice.get(d.namespace ?? d.selectionNodeId);
      app.stepStatus[slice]?.domains.push(d);
    }
    for (const d of collectionDomains) {
      if (d.holds !== false) continue;
      app.stepStatus[fieldSlice.get(d.nodeId)]?.domains.push(d);
    }
    refreshMaltCard(app, cardCtx);
    refreshTraceMaltsCard(app, cardCtx);
    refreshHopCard(app, cardCtx);
    refreshLateAdditionsCard(app, cardCtx);
    refreshMashCard(app, cardCtx);
    refreshBrewDayCard(app, cardCtx);
    refreshWaterCard(app, cardCtx);
  }

  return { compute };
}
