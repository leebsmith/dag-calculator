// Snapshot seam: editable-state snapshots for autosave, the frozen valuation,
// the report inputs, and the presentation catalog. This is the single owner of
// the persistent payload shape. The factory receives an explicit view accessor
// so its methods never depend on Alpine's `this`.

import { buildReportCatalog } from "../views/registry/catalog.js";
import { requireObservability } from "../observability.js";
import {
  buildReportFormatted,
  buildReportSummaries,
  buildReportTables,
} from "../views/producer/reportFormat.js";
import {
  shapeDraftState,
  shapeFreezePayload,
  shapeFrozenValue,
  shapeProvenanceEntry,
  shapeReportInputs,
  shapeReportValidation,
  shapeTelemetryEntry,
} from "../views/snapshotFormatters.js";

export const DRAFT_SCHEMA_VERSION = 4;
export const VALUATION_FORMAT = "outputs";

// AI AGENT HOOKS: Use this snapshot factory for draft autosave state and frozen
// valuation payloads. Do not duplicate this logic elsewhere.
export function createSnapshotActions({
  artifact,
  master,
  session,
  getView,
  observability = requireObservability(null, "createSnapshotActions"),
}) {
  function draftState() {
    return shapeDraftState({
      identity: session.identity(),
      hopStrategy: getView().hopStrategy,
      roots: master.allRoots(),
      collections: session.collections(),
      selections: session.selections(),
      schemaVersion: DRAFT_SCHEMA_VERSION,
    });
  }

  function freezePayload() {
    const engine = session.getEngine();
    const valuation = {};
    for (const id of engine.topoOrder) {
      const node = artifact.nodes[id];
      valuation[id] = shapeFrozenValue(engine.get(id), node);
    }
    const provenance = {};
    for (const [id, node] of Object.entries(artifact.nodes)) {
      if (node.kind !== "selection") continue;
      const refValue = engine.get(node.ref);
      if (refValue === "" || refValue == null) continue;
      provenance[id] = shapeProvenanceEntry(refValue);
    }
    return shapeFreezePayload({
      valuation,
      provenance,
      schemaVersion: DRAFT_SCHEMA_VERSION,
      valuationFormat: VALUATION_FORMAT,
      conformance: getView().styleConformanceReport?.() ?? null,
    });
  }

  function reportInputs() {
    const engine = session.getEngine();
    const validation = shapeReportValidation({
      relations: engine.relationStates(),
      domains: engine.domainStates(),
      fieldDomains: engine.fieldDomainStates(),
      collectionDomains: engine.collectionDomainStates(),
    });
    const telemetry = {};
    const boundaryExtras = getView().boundaryExtras;
    for (const id of session.boundaryNodes) {
      const result = engine.get(id);
      if (!result || typeof result.fingerprint !== "string") continue;
      telemetry[id] = shapeTelemetryEntry({
        binding: artifact.nodes[id].binding,
        fingerprint: result.fingerprint,
        extra: boundaryExtras?.[id],
      });
    }
    return shapeReportInputs({ validation, telemetry });
  }

  function reportCatalog() {
    return buildReportCatalog(artifact, getView().unitMode);
  }

  function reportFormatted() {
    return buildReportFormatted(
      artifact,
      reportCatalog(),
      session.getEngine(),
      observability.reportError
    );
  }

  function reportFormattedTables() {
    return buildReportTables(
      artifact,
      reportCatalog(),
      session.getEngine(),
      getView().hopStrategy ?? "",
      observability.reportError
    );
  }

  function reportFormattedSummaries() {
    return buildReportSummaries(artifact, reportCatalog(), session.getEngine());
  }

  return {
    draftState,
    freezePayload,
    reportInputs,
    reportCatalog,
    reportFormatted,
    reportFormattedTables,
    reportFormattedSummaries,
  };
}

export const KEYS = [
  "draftState",
  "freezePayload",
  "reportInputs",
  "reportCatalog",
  "reportFormatted",
  "reportFormattedTables",
  "reportFormattedSummaries",
];
