// Snapshot seam: editable-state snapshots for autosave, the frozen valuation,
// the report inputs, and the presentation catalog. This is the single owner of
// the persistent payload shape.

import { buildReportCatalog } from "../views/registry/catalog.js";
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

// Batch payload shape revision (independent of the artifact grammar version).
export const DRAFT_SCHEMA_VERSION = 4;

// Frozen valuation format marker; a missing marker means the legacy
// `{ outputs, fingerprint }` wrapper shape.
export const VALUATION_FORMAT = "outputs";

// AI AGENT HOOKS: Use this snapshot installer for draft autosave state and
// frozen valuation payloads. Do not duplicated this logic elsewhere.
export function installSnapshot(app, { artifact, master, session }) {
  Object.assign(app, {
    // Editable-state snapshot (roots + collections + copied-forward selections)
    // for draft autosave.
    draftState() {
      return shapeDraftState({
        identity: session.identity(),
        hopStrategy: this.hopStrategy,
        roots: master.allRoots(),
        collections: session.collections(),
        selections: session.selections(),
        schemaVersion: DRAFT_SCHEMA_VERSION,
      });
    },

    // Full valuation (node-id -> value for every node) + provenance (per
    // selection: source_template_id only). Browser-computed — the backend only
    // stores it.
    freezePayload() {
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
        conformance: this.styleConformanceReport?.() ?? null,
      });
    },

    // Freeze-time report inputs: captured, never recomputed. The fingerprint is
    // the one the engine applied, not a fresh request fingerprint — an edit in
    // the debounce window would otherwise pair telemetry with a different solve.
    reportInputs() {
      const engine = session.getEngine();
      const validation = shapeReportValidation({
        relations: engine.relationStates(),
        domains: engine.domainStates(),
        fieldDomains: engine.fieldDomainStates(),
        collectionDomains: engine.collectionDomainStates(),
      });
      const telemetry = {};
      for (const id of session.boundaryNodes) {
        const result = engine.get(id);
        if (!result || typeof result.fingerprint !== "string") continue;
        telemetry[id] = shapeTelemetryEntry({
          binding: artifact.nodes[id].binding,
          fingerprint: result.fingerprint,
          extra: this.boundaryExtras?.[id],
        });
      }
      return shapeReportInputs({ validation, telemetry });
    },

    // Per-path presentation for the report bundle. Unit-aware: the frozen
    // bundle keeps the units this batch was displaying at freeze.
    reportCatalog() {
      return buildReportCatalog(artifact, this.unitMode);
    },

    // Freeze-time display strings. The report reads these and never converts.
    reportFormatted() {
      return buildReportFormatted(artifact, this.reportCatalog(), session.getEngine());
    },

    reportFormattedTables() {
      return buildReportTables(
        artifact,
        this.reportCatalog(),
        session.getEngine(),
        this.hopStrategy ?? ""
      );
    },

    reportFormattedSummaries() {
      return buildReportSummaries(artifact, this.reportCatalog(), session.getEngine());
    },
  });
}

export const KEYS = ["draftState", "freezePayload", "reportInputs", "reportCatalog", "reportFormatted", "reportFormattedTables", "reportFormattedSummaries"];
