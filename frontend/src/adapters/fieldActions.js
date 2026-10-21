// Field and collection edit actions: unit-aware writes, envelope clamps,
// seed-derived resets, selection copy-in, and row add/remove/normalization.

import { toBase } from "../engine/index.js";
import { hamiltonPct } from "../views/hamilton.js";
import { nonlinearFns } from "../views/producer.js";
import { derivationsFor } from "../views/seedDerivations.js";
import { clampBoundsFor } from "../views/registry/presentation.js";
import { SYSTEM_NODES as N } from "../views/registry/system.js";

export function installFieldActions(app, { artifact, session, refToSelectionMap }) {
  Object.assign(app, {
    // Clamp an editable value to the envelope of its selected component, when
    // one applies (a batch root bounded by a selection's fields). Returns the
    // clamped value; an unset optional selection contributes no bounds.
    clampToSelection(nodeId, value) {
      if (typeof value !== "number") return value;
      const bounds = clampBoundsFor(nodeId);
      if (!bounds) return value;
      const engine = session.getEngine();
      const low = engine.resolve(bounds.low);
      const high = engine.resolve(bounds.high);
      if (typeof low === "number" && value < low) value = low;
      if (typeof high === "number" && value > high) value = high;
      return value;
    },

    edit(field, value) {
      if (!field.editable || !field.target) return;
      const engine = session.getEngine();
      let raw = field.control === "number" ? Number(value) : value;
      // The input renders in the field's display unit (dimension default or
      // per-field override); convert the typed value back to the base unit
      // before it reaches the engine.
      if (field.control === "number" && field.dimension && field.unitId && value !== "") {
        raw = toBase(artifact, field.dimension, field.unitId, Number(value), nonlinearFns(artifact, engine));
      }
      // Store the raw value live (no envelope clamp here): clamping on every
      // keystroke fights the user mid-typing, so it is deferred to commitField
      // on blur. The report-only relations still flag out-of-range values.
      this.setRoot(field.target.nodeId, raw);
      if (field.target.nodeId === N.topology) this.resetIntensiveValue(raw);
      if (field.target.scope === "root" && raw) this.copyInCascade(field.target.nodeId);
      this.scheduleSolve();
      this.notify();
    },

    // Clamp an envelope-bounded number field to its selected component's range
    // when the field is committed (blur/change). Live `edit` stores raw so typing
    // isn't fought; this enforces the envelope only when the value is final.
    commitField(field) {
      if (!field.editable || !field.target || field.control !== "number") return;
      const current = this.master.getRoot(field.target.nodeId);
      if (typeof current !== "number") return;
      const clamped = this.clampToSelection(field.target.nodeId, current);
      if (clamped !== current) {
        this.setRoot(field.target.nodeId, clamped);
        this.scheduleSolve();
        this.notify();
      }
    },

    // Restore a seed-derived root to its source value (the "↺" affordance shown
    // once the user has overridden it).
    resetField(field) {
      const nodeId = field?.target?.nodeId;
      if (!nodeId || field.seededValue === undefined) return;
      this.setRoot(nodeId, field.seededValue);
      this.scheduleSolve();
      this.notify();
    },

    // Switching topology reinterprets the intensive value (L/kg vs dimensionless
    // r), so reset it to the topology's sensible default (mirrors the legacy
    // onTopologyChange).
    resetIntensiveValue(topology) {
      const constant =
        topology === "runoff_ratio" ? "default_runoff_ratio" : "default_mash_thickness_l_per_kg";
      const value = artifact.constants[constant]?.value;
      if (typeof value === "number") this.setRoot(N.intensiveValue, value);
    },

    // Selection -> root copy-in (view-only). Picking a source report / target
    // profile pre-fills the editable ion roots; they remain user-editable.
    copyInCascade(refRootId) {
      const selectionNode = refToSelectionMap.get(refRootId);
      if (!selectionNode) return;
      const component = session.getEngine().get(selectionNode);
      if (!component) return;
      for (const { rootId, derive } of derivationsFor(selectionNode)) {
        const value = derive(component);
        if (typeof value === "number" || (typeof value === "string" && value !== "")) {
          this.setRoot(rootId, value);
        }
      }
    },

    runAction(action) {
      this[action.handler]?.();
    },

    editCell(field, rowIndex, columnId, value) {
      const engine = session.getEngine();
      const column = field.columns.find((c) => c.id === columnId);
      // Convert a display-unit cell back to the base unit before storing; a
      // dimensioned cell with no display unit still stores a real number (not
      // the input's string).
      let raw = value;
      if (value !== "" && column?.dimension) {
        const n = Number(value);
        raw = column.displayUnit ? toBase(artifact, column.dimension, column.displayUnit, n) : n;
      }
      const rows = (engine.get(field.target.nodeId) ?? []).map((row, i) =>
        i === rowIndex ? { ...row, [columnId]: raw } : { ...row }
      );
      // Formulation rule (TODO/L3): `parts` is the grist authoring column; `pct`
      // (and thus the grain-bill `w_i`) is the normalized allocation that sums to
      // exactly 100% at 0.1% resolution. Boil hops use the same parts -> pct rule
      // over their IBU pool.
      let next = rows;
      if (columnId === "parts") {
        if (field.target.nodeId === N.majorMalts) next = this.normalizeGrist(rows);
        else if (field.target.nodeId === N.boilHops) next = this.normalizeHopRows(rows);
      }
      engine.setCollection(field.target.nodeId, next);
      this.scheduleSolve();
      this.notify();
    },

    addRow(field) {
      const engine = session.getEngine();
      const node = artifact.nodes[field.target.nodeId];
      const schema = artifact.primitive_schemas[node.item_schema] ?? {};
      // Seed a row with type-appropriate defaults (numbers, first taxonomy
      // member, schema default) rather than empty strings, so a new row is
      // well-formed and doesn't POST a request that fails validation.
      const defaults = {};
      for (const [key, spec] of Object.entries(schema)) {
        if (spec.default !== undefined) defaults[key] = spec.default;
        else if (spec.type === "boolean") defaults[key] = false;
        else if (spec.taxonomy) defaults[key] = artifact.taxonomies[spec.taxonomy]?.[0] ?? "";
        else if (spec.dimension) defaults[key] = 0;
        else defaults[key] = "";
      }
      engine.setCollection(field.target.nodeId, [...(engine.get(field.target.nodeId) ?? []), defaults]);
      this.scheduleSolve();
      this.notify();
    },

    removeRow(field, rowIndex) {
      const engine = session.getEngine();
      const rows = (engine.get(field.target.nodeId) ?? []).filter((_, i) => i !== rowIndex);
      let next = rows;
      if (field.target.nodeId === N.majorMalts) next = this.normalizeGrist(rows);
      else if (field.target.nodeId === N.boilHops) next = this.normalizeHopRows(rows);
      engine.setCollection(field.target.nodeId, next);
      this.scheduleSolve();
      this.notify();
    },

    // Hamilton-normalize the grain bill's `pct` (fractions summing to 1) from its
    // `parts`.
    normalizeGrist(rows) {
      if (!rows.length) return rows;
      const pcts = hamiltonPct(rows.map((row) => row.parts));
      return rows.map((row, i) => ({ ...row, pct: pcts[i] }));
    },

    // Hamilton-normalize the boil-hop IBU shares (`pct`) from their `parts`.
    normalizeHopRows(rows) {
      if (!rows.length) return rows;
      const pcts = hamiltonPct(rows.map((row) => row.parts));
      return rows.map((row, i) => ({ ...row, pct: pcts[i] }));
    },

    // Dispatch a collection-table's add-row action: a bespoke handler named by
    // the manifest, else the generic blank-row add.
    runCollectionAdd(field) {
      const handler = field.addAction && this[field.addAction];
      if (typeof handler === "function") handler.call(this);
      else this.addRow(field);
    },
  });
}
