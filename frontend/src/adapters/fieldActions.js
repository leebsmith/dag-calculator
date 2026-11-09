// Field and collection edit actions: unit-aware writes, envelope clamps,
// seed-derived resets, selection copy-in, and row add/remove/normalization.

import { toBase } from "../engine/index.js";
import { clamp } from "../utils.js";
import { fieldInputKey, normalizedRowShares, rowDefaults } from "../views/producer/authoring.js";
import { nonlinearFns } from "../views/producer.js";
import { derivationsFor } from "../views/seedDerivations.js";
import { clampBoundsFor } from "../views/registry/presentation.js";
import { SYSTEM_NODES as N } from "../views/registry/system.js";
import { requireObservability } from "../observability.js";

export function createFieldActions({
  artifact,
  session,
  refToSelectionMap,
  getView,
  observability = requireObservability(null, "createFieldActions"),
}) {
  const actions = {
    inputDrafts: {},

    // Number inputs keep the user's raw text while focused; the engine still
    // receives every keystroke, but the DOM value is not reformatted until the
    // field commits on blur.
    inputKey(prefix, ...parts) {
      return fieldInputKey(prefix, ...parts);
    },

    inputDraft(key, fallback) {
      return Object.prototype.hasOwnProperty.call(actions.inputDrafts, key)
        ? actions.inputDrafts[key]
        : fallback;
    },

    setInputDraft(key, raw) {
      actions.inputDrafts[key] = raw;
    },

    clearInputDraft(key) {
      delete actions.inputDrafts[key];
    },

    editNumberInput(key, field, raw) {
      actions.setInputDraft(key, raw);
      actions.edit(field, raw);
    },

    commitNumberInput(key, field) {
      actions.clearInputDraft(key);
      actions.commitField(field);
      getView().notify();
    },

    editCellInput(key, field, rowIndex, columnId, raw) {
      actions.setInputDraft(key, raw);
      actions.editCell(field, rowIndex, columnId, raw);
    },

    commitCellInput(key) {
      actions.clearInputDraft(key);
      getView().notify();
    },

    commitCellText(key, field, rowIndex, columnId, raw) {
      actions.editCell(field, rowIndex, columnId, raw);
      actions.clearInputDraft(key);
      getView().notify();
    },

    editDraftCellInput(key, rowIndex, columnId, raw) {
      actions.setInputDraft(key, raw);
      getView().editDraftCell(rowIndex, columnId, raw);
    },

    commitDraftCellInput(key) {
      actions.clearInputDraft(key);
      getView().notify();
    },

    // Clamp an editable value to the envelope of its selected component, when
    // one applies (a batch root bounded by a selection's fields). Returns the
    // clamped value; an unset optional selection contributes no bounds.
    clampToSelection(nodeId, value) {
      if (typeof value !== "number") return value;
      const bounds = clampBoundsFor(nodeId);
      if (!bounds) return value;
      const engine = session.getEngine();
      return clamp(value, engine.resolve(bounds.low), engine.resolve(bounds.high));
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
      // The handoff must read the old solve before the topology root changes.
      if (field.target.nodeId === N.topology) actions.handoffIntensiveValue(raw);
      // Store the raw value live (no envelope clamp here): clamping on every
      // keystroke fights the user mid-typing, so it is deferred to commitField
      // on blur. The report-only relations still flag out-of-range values.
      getView().setRoot(field.target.nodeId, raw);
      if (field.control === "selection-picker") {
        getView().pickSelection(field.target.nodeId, raw);
      }
      if (field.target.scope === "root" && raw) actions.copyInCascade(field.target.nodeId);
      getView().scheduleSolve();
      getView().notify();
    },

    // Clamp an envelope-bounded number field to its selected component's range
    // when the field is committed (blur/change). Live `edit` stores raw so typing
    // isn't fought; this enforces the envelope only when the value is final.
    commitField(field) {
      if (!field.editable || !field.target || field.control !== "number") return;
      const current = getView().master.getRoot(field.target.nodeId);
      if (typeof current !== "number") return;
      const clamped = actions.clampToSelection(field.target.nodeId, current);
      if (clamped !== current) {
        getView().setRoot(field.target.nodeId, clamped);
        getView().scheduleSolve();
        getView().notify();
      }
    },

    // Restore a root to its inherited value (the "↺" affordance shown once the
    // user has overridden it). Roots that inherit through an artifact `default`
    // are simply unset; residual host-seeded roots are re-pushed from their
    // component.
    resetField(field) {
      const nodeId = field?.target?.nodeId;
      if (!nodeId) return;
      if (field.seededReset === "unset") {
        getView().unsetRoot(nodeId);
        getView().scheduleSolve();
        getView().notify();
        return;
      }
      if (field.seededValue === undefined) return;
      getView().setRoot(nodeId, field.seededValue);
      getView().scheduleSolve();
      getView().notify();
    },

    // Switching topology reinterprets which intensive root is live. The new
    // active root inherits the current solved value, so the physical mash does
    // not jump to a constant default; fall back to the default only when the
    // solve is unavailable.
    handoffIntensiveValue(topology) {
      const engine = session.getEngine();
      const [nodeId, sourcePath, constant] =
        topology === "runoff_ratio"
          ? [N.runoffRatio, "batch.runnings_ratio", "default_runoff_ratio"]
          : [
              N.mashThickness,
              "solver.batch.mash_thickness_l_per_kg",
              "default_mash_thickness_l_per_kg",
            ];
      let solved;
      try {
        solved = engine.resolve(sourcePath);
      } catch (err) {
        observability.reportError("fieldActions.handoffIntensiveValue", err);
      }
      const value =
        typeof solved === "number" && Number.isFinite(solved) && solved > 0
          ? solved
          : artifact.constants[constant]?.value;
      if (typeof value === "number") getView().setRoot(nodeId, value);
    },

    // One-shot pin for the thickness-ceiling warning: only offered while the
    // thickness is implied (runoff topology), and it writes the rig default, not
    // the ceiling. It promises nothing about capacity.
    pinMashThickness() {
      const engine = session.getEngine();
      if (engine.get("batch.topology") !== "runoff_ratio") return;
      const floor = engine.resolve("equipment.min_lgr_l_per_kg");
      const fallback = artifact.constants.default_mash_thickness_l_per_kg?.value;
      const target = Math.max(
        typeof fallback === "number" ? fallback : 0,
        typeof floor === "number" ? floor : 0
      );
      if (target <= 0) return;
      getView().setRoot(N.mashThickness, target);
      getView().scheduleSolve();
      getView().notify();
    },

    runFindingAction(finding) {
      if (!finding?.action) return;
      actions.runAction(finding.action);
    },

    // Push the residual (non-declarable) roots that a selection still has to
    // supply. Everything the artifact can express as a `default` is pulled, not
    // pushed, so this list is deliberately tiny (see views/seedDerivations.js).
    resetSeededRoots(selectionNodeId) {
      for (const { rootId } of derivationsFor(selectionNodeId)) getView().unsetRoot(rootId);
    },

    copyInCascade(refRootId) {
      const selectionNode = refToSelectionMap.get(refRootId);
      if (!selectionNode) return;
      actions.resetSeededRoots(selectionNode);
      const component = session.getEngine().get(selectionNode);
      if (!component) return;
      for (const { rootId, derive } of derivationsFor(selectionNode)) {
        const value = derive(component);
        if (typeof value === "number" || (typeof value === "string" && value !== "")) {
          getView().setRoot(rootId, value);
        }
      }
    },

    runAction(action) {
      actions[action.handler]?.();
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
        if (field.target.nodeId === N.majorMalts) next = actions.normalizeGrist(rows);
        else if (
          field.target.nodeId === N.boilHops ||
          field.target.nodeId === N.whirlpoolHops
        ) {
          next = actions.normalizeHopRows(rows);
        }
      }
      engine.setCollection(field.target.nodeId, next);
      getView().scheduleSolve();
      getView().notify();
    },

    addRow(field) {
      const engine = session.getEngine();
      const node = artifact.nodes[field.target.nodeId];
      const schema = artifact.primitive_schemas[node.item_schema] ?? {};
      const defaults = rowDefaults(schema, artifact.taxonomies);
      engine.setCollection(field.target.nodeId, [...(engine.get(field.target.nodeId) ?? []), defaults]);
      getView().scheduleSolve();
      getView().notify();
    },

    removeRow(field, rowIndex) {
      const engine = session.getEngine();
      const rows = (engine.get(field.target.nodeId) ?? []).filter((_, i) => i !== rowIndex);
      let next = rows;
      if (field.target.nodeId === N.majorMalts) next = actions.normalizeGrist(rows);
      else if (
        field.target.nodeId === N.boilHops ||
        field.target.nodeId === N.whirlpoolHops
      ) {
        next = actions.normalizeHopRows(rows);
      }
      engine.setCollection(field.target.nodeId, next);
      getView().scheduleSolve();
      getView().notify();
    },

    // Hamilton-normalize the grain bill's `pct` (fractions summing to 1) from its
    // `parts`.
    normalizeGrist(rows) {
      return normalizedRowShares(rows);
    },

    // Hamilton-normalize the boil-hop IBU shares (`pct`) from their `parts`.
    normalizeHopRows(rows) {
      return normalizedRowShares(rows);
    },

    collectionCanAdd(field) {
      if (!field.prose) return true;
      const rows = field.rows ?? [];
      const last = rows[rows.length - 1];
      if (!last) return true;
      return Object.values(last).some(
        (value) => typeof value === "string" && value.trim() !== ""
      );
    },

    collectionAddLabel(field) {
      const rows = field.rows ?? [];
      if (!field.prose || rows.length === 0) return field.addLabel;
      return field.addLabelMore ?? field.addLabel;
    },

    // Dispatch a collection-table's add-row action: a bespoke handler named by
    // the manifest, else the generic blank-row add.
    runCollectionAdd(field) {
      const handler = field.addAction && actions[field.addAction];
      if (typeof handler === "function") handler();
      else actions.addRow(field);
    },
  };
  return actions;
}

export const KEYS = ["inputDrafts", "inputKey", "inputDraft", "setInputDraft", "clearInputDraft", "editNumberInput", "commitNumberInput", "editCellInput", "commitCellInput", "commitCellText", "editDraftCellInput", "commitDraftCellInput", "clampToSelection", "edit", "commitField", "resetField", "handoffIntensiveValue", "pinMashThickness", "runFindingAction", "resetSeededRoots", "copyInCascade", "runAction", "editCell", "addRow", "removeRow", "normalizeGrist", "normalizeHopRows", "runCollectionAdd", "collectionCanAdd", "collectionAddLabel"];
