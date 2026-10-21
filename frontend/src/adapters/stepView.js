// Step view composition: evaluates the producer for every step, indexes
// violations onto their owning slices, and refreshes the card readouts.

import { produce } from "../views/producer.js";
import { refreshYeastCard } from "./cards/yeast.js";
import { refreshStyleCard } from "./cards/style.js";
import { refreshHopCard } from "./cards/hops.js";
import { refreshLateAdditionsCard } from "./cards/late-additions.js";
import { refreshTraceMaltsCard } from "./cards/trace-malts.js";
import { refreshMaltCard } from "./cards/malt.js";
import { refreshMashCard } from "./cards/mash.js";
import { refreshBrewDayCard } from "./cards/brew-day.js";

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
    } catch {
      return [];
    }
  }

  function compute(app) {
    const engine = session.getEngine();
    const fieldDomains = safe(() => engine.fieldDomainStates());
    const fieldDomainIndex = {};
    for (const d of fieldDomains) fieldDomainIndex[`${d.selectionNodeId}.${d.field}`] = d;

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
    app.relations = safe(() => engine.relationStates());
    app.domains = safe(() => engine.domainStates());
    app.fieldDomains = fieldDomains;
    app.collectionDomains = collectionDomains;
    refreshYeastCard(app, cardCtx);
    refreshStyleCard(app, cardCtx);
    app.violationCount =
      app.relations.filter((r) => !r.holds).length +
      app.domains.filter((d) => !d.holds).length +
      fieldDomains.filter((d) => !d.holds).length +
      collectionDomains.filter((d) => !d.holds).length;

    app.stepStatus = {};
    for (const step of steps) app.stepStatus[step.slice] = { relations: [], domains: [] };
    for (const r of app.relations) {
      if (r.holds) continue;
      for (const slice of relationSlices(relationDefs[r.id]?.predicate)) {
        app.stepStatus[slice]?.relations.push(r);
      }
    }
    for (const d of app.domains) {
      if (d.holds) continue;
      app.stepStatus[d.nodeId.split(".")[0]]?.domains.push(d);
    }
    for (const d of fieldDomains) {
      if (d.holds) continue;
      const slice =
        fieldSlice.get(`${d.selectionNodeId}.${d.field}`) ?? selectionSlice.get(d.selectionNodeId);
      app.stepStatus[slice]?.domains.push(d);
    }
    for (const d of collectionDomains) {
      if (d.holds) continue;
      app.stepStatus[fieldSlice.get(d.nodeId)]?.domains.push(d);
    }
    refreshMaltCard(app, cardCtx);
    refreshTraceMaltsCard(app, cardCtx);
    refreshHopCard(app, cardCtx);
    refreshLateAdditionsCard(app, cardCtx);
    refreshMashCard(app, cardCtx);
    refreshBrewDayCard(app, cardCtx);
  }

  return { compute };
}
