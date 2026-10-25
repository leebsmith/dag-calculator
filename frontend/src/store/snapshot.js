// Snapshot seam: editable-state snapshots for autosave and full frozen
// valuation. This is the single owner of the persistent payload shape.

// Batch payload shape revision (independent of the artifact grammar version).
export const DRAFT_SCHEMA_VERSION = 4;

// Frozen valuation format marker; a missing marker means the legacy
// `{ outputs, fingerprint }` wrapper shape.
export const VALUATION_FORMAT = "outputs";

// AI AGENT HOOKS: Use this helper for the persisted value of a frozen node.
// Boundary nodes store their plain output map, never engine cache wrappers.
// Do not duplicated this logic elsewhere.
function frozenValue(engine, node, id) {
  const value = engine.get(id);
  if (value === undefined) return null;
  return node.kind === "boundary" ? value.outputs : value;
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
  });
}

export const KEYS = ["draftState", "freezePayload", "reportInputs"];
