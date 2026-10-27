// Snapshot seam: editable-state snapshots for autosave, the frozen valuation,
// the report inputs, and the presentation catalog. This is the single owner of
// the persistent payload shape.

import { buildReportCatalog } from "../views/registry/catalog.js";
import { buildReportFormatted, buildReportTables } from "../views/producer/reportFormat.js";

// Batch payload shape revision (independent of the artifact grammar version).
export const DRAFT_SCHEMA_VERSION = 4;

// Frozen valuation format marker; a missing marker means the legacy
// `{ outputs, fingerprint }` wrapper shape.
export const VALUATION_FORMAT = "outputs";

// AI AGENT HOOKS: Use this helper for the persisted value of a frozen node.
// Boundary nodes store their plain output map, never engine cache wrappers, and
// only the outputs the artifact declares. Solver responses carry advisory
// lists (warnings, notes, telemetry) that belong in report_inputs.telemetry,
// never in the valuation the report catalog has to cover.
// Do not duplicated this logic elsewhere.
function frozenValue(engine, node, id) {
  const value = engine.get(id);
  if (value === undefined) return null;
  if (node.kind !== "boundary") return value;
  const outputs = value.outputs ?? {};
  return Object.fromEntries(
    Object.keys(node.outputs ?? {})
      .filter((key) => key in outputs)
      .map((key) => [key, outputs[key]])
  );
}

// AI AGENT HOOKS: Use this snapshot installer for draft autosave state and
// frozen valuation payloads. Do not duplicated this logic elsewhere.
export function installSnapshot(app, { artifact, master, session }) {
  Object.assign(app, {
    // Editable-state snapshot (roots + collections + copied-forward selections)
    // for draft autosave.
    draftState() {
      return {
        identity: { ...session.identity() },
        roots: master.allRoots(),
        collections: { ...session.collections() },
        selections: { ...session.selections() },
        schema_version: DRAFT_SCHEMA_VERSION,
      };
    },

    // Full valuation (node-id -> value for every node) + provenance (per
    // selection: source_template_id only). Browser-computed — the backend only
    // stores it.
    freezePayload() {
      const engine = session.getEngine();
      const valuation = {};
      for (const id of engine.topoOrder) {
        const node = artifact.nodes[id];
        valuation[id] = frozenValue(engine, node, id);
      }
      const provenance = {};
      for (const [id, node] of Object.entries(artifact.nodes)) {
        if (node.kind !== "selection") continue;
        const refValue = engine.get(node.ref);
        if (refValue === "" || refValue == null) continue;
        provenance[id] = { source_template_id: refValue };
      }
      return {
        valuation,
        valuation_format: VALUATION_FORMAT,
        provenance,
        schema_version: DRAFT_SCHEMA_VERSION,
        conformance: this.styleConformanceReport?.() ?? null,
      };
    },

    // Freeze-time report inputs: captured, never recomputed. The fingerprint is
    // the one the engine applied, not a fresh request fingerprint — an edit in
    // the debounce window would otherwise pair telemetry with a different solve.
    reportInputs() {
      const engine = session.getEngine();
      const validation = {
        relations: engine.relationStates(),
        domains: engine.domainStates(),
        field_domains: engine.fieldDomainStates(),
        collection_domains: engine.collectionDomainStates(),
      };
      const telemetry = {};
      for (const id of session.boundaryNodes) {
        const result = engine.get(id);
        if (!result || typeof result.fingerprint !== "string") continue;
        const extra = this.boundaryExtras?.[id] ?? {};
        telemetry[id] = {
          binding: artifact.nodes[id].binding,
          fingerprint: result.fingerprint,
          telemetry: extra.telemetry ?? [],
          warnings: extra.warnings ?? [],
          notes: extra.notes ?? [],
        };
      }
      return { validation, telemetry };
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
      return buildReportTables(artifact, this.reportCatalog(), session.getEngine());
    },
  });
}

export const KEYS = ["draftState", "freezePayload", "reportInputs", "reportCatalog", "reportFormatted", "reportFormattedTables"];
