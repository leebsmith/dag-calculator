// Snapshot seam: editable-state snapshots for autosave and full frozen
// valuation. This is the single owner of the persistent payload shape.

// Batch payload shape revision (independent of the artifact grammar version).
export const DRAFT_SCHEMA_VERSION = 3;

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
  });
}

export const KEYS = ["draftState", "freezePayload"];
