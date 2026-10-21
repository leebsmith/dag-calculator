// Snapshot seam: editable-state snapshots for autosave, full frozen valuation,
// and provenance drift detection. This is the single owner of the persistent
// payload shape.

import { canonicalize, sha256Hex } from "../engine/index.js";

// Frozen valuation format marker; a missing marker means the legacy
// `{ outputs, fingerprint }` wrapper shape.
export const VALUATION_FORMAT = "outputs";

// AI AGENT HOOKS: Use this helper for the persisted value of a frozen node.
// Boundary nodes store their plain output map, never engine cache wrappers.
// Do not duplicated this logic elsewhere.
function frozenValue(engine, node, id) {
  const value = engine.get(id);
  return node.kind === "boundary" ? value.outputs : value;
}

// AI AGENT HOOKS: Use this snapshot installer for draft autosave state, frozen
// valuation payloads, and provenance drift checks. Do not duplicated this logic
// elsewhere.
export function installSnapshot(app, { artifact, cache, master, session }) {
  Object.assign(app, {
    // Editable-state snapshot (roots + collections) for draft autosave.
    draftState() {
      return {
        roots: master.allRoots(),
        collections: { ...session.collections() },
        schema_version: artifact.schema_version ?? 2,
      };
    },

    // Full valuation (node-id -> value for every node) + provenance (per
    // selection: source_template_id + content-hash of the referenced seed
    // component). Browser-computed — the backend only stores it.
    freezePayload() {
      const engine = session.getEngine();
      const valuation = {};
      for (const id of engine.topoOrder) {
        const node = artifact.nodes[id];
        // A selection with no chosen component has no value (ref is "").
        if (node.kind === "selection") {
          const refValue = engine.get(node.ref);
          if (refValue === "" || refValue === undefined) {
            valuation[id] = null;
            continue;
          }
        }
        valuation[id] = frozenValue(engine, node, id);
      }
      const provenance = {};
      for (const [id, node] of Object.entries(artifact.nodes)) {
        if (node.kind !== "selection") continue;
        const refValue = engine.get(node.ref);
        if (refValue === "" || refValue === undefined) continue;
        const component = cache.references[node.schema]?.[refValue];
        provenance[id] = {
          source_template_id: refValue,
          source_revision: component ? sha256Hex(canonicalize(component)) : null,
        };
      }
      return {
        valuation,
        valuation_format: VALUATION_FORMAT,
        provenance,
        schema_version: artifact.schema_version ?? 2,
        conformance: this.styleConformanceReport?.() ?? null,
      };
    },

    // Compare a frozen batch's provenance hashes against the CURRENT seeds,
    // returning the selections whose referenced component has changed (or gone
    // missing) since freeze. Drift is explicit, never silent (seed-substrate §4).
    detectDrift(provenance) {
      const drift = [];
      for (const [selectionId, p] of Object.entries(provenance ?? {})) {
        const node = artifact.nodes[selectionId];
        if (!node || node.kind !== "selection") continue;
        const component = cache.references[node.schema]?.[p.source_template_id];
        if (!component) {
          drift.push({ selectionNodeId: selectionId, templateId: p.source_template_id, reason: "missing" });
          continue;
        }
        if (sha256Hex(canonicalize(component)) !== p.source_revision) {
          drift.push({ selectionNodeId: selectionId, templateId: p.source_template_id, reason: "changed" });
        }
      }
      return drift;
    },
  });
}
