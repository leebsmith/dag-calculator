// Collection draft editor: scratch-copy state, normalization, unit-aware cell
// edits, and the draft-row helpers shared by the catalog modals. The app-facing
// method names are unchanged so partials and tests keep their bindings.

import { toBase } from "../engine/index.js";
import { hamiltonPct } from "../views/hamilton.js";
import { displayValue, nonlinearFns, resolveCollectionColumns } from "../views/producer.js";
import {
  EQUAL_SUGAR_PARTS,
  resolvedSugarMasses,
} from "../views/producer/sugarAllocation.js";
import { registry, steps } from "../views/steps.js";
import { UNIT_SYMBOLS } from "../views/registry/units.js";
import { HOP_NODES as H } from "../views/registry/hops.js";
import { SYSTEM_NODES as N } from "../views/registry/system.js";
import { whirlpoolDraftCeilings } from "../views/producer/whirlpoolPolicy.js";
import { requireObservability } from "../observability.js";
import { formatWithDecimals, preferredUnit, roundTo, unitSymbol } from "../utils.js";
import { CATALOG_CHROME_KEYS } from "./cards/catalogChrome.js";

function draftCellValue(col, row, ri, resolved, ceilings) {
  if (col.id === "resolved_mass_kg") return resolved[ri]?.massKg ?? row[col.id] ?? 0;
  if (col.id === "ceiling_c") return ceilings[ri]?.maxC ?? null;
  return row[col.id];
}

function draftCellDisplay(artifact, col, value, nl) {
  if (!(col.displayUnit && col.dimension && typeof value === "number")) {
    return typeof value === "number" ? formatWithDecimals(value, col.decimals) : value;
  }
  const displayed = displayValue(artifact, col.dimension, col.displayUnit, value, nl);
  return formatWithDecimals(displayed, col.decimals);
}

// AI AGENT HOOKS: Use this installer for every draft-editor state transition,
// draft-row normalization, and unit-aware draft cell read/write. Do not
// duplicated this logic elsewhere.
export function createDraftEditor({
  artifact,
  ui,
  session,
  getView,
  observability = requireObservability(null, "createDraftEditor"),
}) {
  const actions = {
    draftOpen: false,
    draftNodeId: "",
    draftRows: [],
    draftBaseline: "",
    draftDiscardOpen: false,

    draftEntry() {
      for (const step of steps) {
        for (const entry of step.fields) {
          if (entry && typeof entry === "object" && entry.collection === getView().draftNodeId) return entry;
        }
      }
      return {};
    },

    // Draft total (mass-unit aware) for the modal header / totals row. Sums
    // `pick(row)` over the draft and formats it in the mass column's display
    // unit (used by the late-additions and trace-malt editors).
    draftMassDisplay(pick) {
      const col = actions.draftColumns.find((c) => c.id === "mass_kg");
      const total = (getView().draftRows ?? []).reduce((sum, r) => sum + (pick(r) || 0), 0);
      if (!col) return String(total);
      const v = displayValue(
        artifact,
        "mass",
        col.displayUnit,
        total,
        nonlinearFns(artifact, session.getEngine())
      );
      const shown = formatWithDecimals(v, col.decimals);
      return `${shown}${col.unit ? " " + col.unit : ""}`;
    },

    openDraft(nodeId) {
      getView().draftNodeId = nodeId;
      getView().draftRows = JSON.parse(JSON.stringify(session.getEngine().get(nodeId) ?? []));
      actions.normalizeDraft();
      getView().draftBaseline = actions.draftSnapshot();
      getView().draftDiscardOpen = false;
      getView().draftOpen = true;
    },

    closeDraft() {
      getView().draftOpen = false;
      getView().draftRows = [];
      getView().draftNodeId = "";
      getView().draftBaseline = "";
      getView().draftDiscardOpen = false;
    },

    // Cancel is destructive: the draft is scratch state, so a changed draft
    // asks before it is thrown away. Save calls closeDraft directly and never
    // prompts.
    dismissDraftDiscard() {
      getView().draftDiscardOpen = false;
    },

    confirmDraftDiscard() {
      getView().draftDiscardOpen = false;
      actions.closeDraft();
    },

    draftSnapshot() {
      return JSON.stringify(getView().draftRows ?? []);
    },

    saveDraft() {
      actions.seedSugarShareWeights();
      session.engine.setCollection(
        getView().draftNodeId,
        JSON.parse(JSON.stringify(actions.normalizeDraft()))
      );
      actions.closeDraft();
      getView().scheduleSolve();
      getView().notify();
    },

    // AI AGENT HOOKS: Use this normalizer for every draft row collection that
    // derives its shares from `parts`. Do not duplicated this logic elsewhere.
    normalizeDraft() {
      if (
        (getView().draftNodeId === N.majorMalts ||
          getView().draftNodeId === N.boilHops ||
          getView().draftNodeId === N.whirlpoolHops) &&
        getView().draftRows.length
      ) {
        const pcts = hamiltonPct(getView().draftRows.map((r) => r.parts));
        getView().draftRows.forEach((r, i) => {
          r.pct = pcts[i];
        });
      }
      return getView().draftRows;
    },

    // Share mode's per-row mass is computed by the artifact on read; a draft is
    // scratch state that is not in the collection, so its preview runs the same
    // allocation without writing the result into the rows.
    draftResolvedRows() {
      if (getView().draftNodeId !== N.sugars || !getView().draftRows.length) return [];
      const engine = session.getEngine();
      let intent;
      let budget;
      try {
        intent = engine.get(N.lateAdditionIntent);
        budget = engine.resolve("batch.sugar_extract_total");
      } catch (err) {
        observability.reportError("draftEditor.draftResolvedRows", err);
        return [];
      }
      if (intent !== "share") return [];
      return resolvedSugarMasses({
        rows: getView().draftRows,
        budgetKg: typeof budget === "number" && Number.isFinite(budget) ? budget : 0,
        mode: "share",
      });
    },

    // A positive share owns a budget, so saving rows with no weights would show
    // zero mass beside a live extract. Complete the draft with equal weights;
    // the load repair applies the same rule to already-saved batches.
    seedSugarShareWeights() {
      if (getView().draftNodeId !== N.sugars || !getView().draftRows.length) return false;
      const engine = session.getEngine();
      let intent;
      let share;
      try {
        intent = engine.get(N.lateAdditionIntent);
        share = Number(engine.get("batch.sugar_extract_share")) || 0;
      } catch (err) {
        observability.reportError("draftEditor.seedSugarShareWeights", err);
        return false;
      }
      if (intent !== "share" || !(share > 0)) return false;
      const total = getView().draftRows.reduce((sum, row) => sum + (Number(row.parts) || 0), 0);
      if (total > 0) return false;
      getView().draftRows.forEach((row) => {
        row.parts = EQUAL_SUGAR_PARTS;
      });
      return true;
    },

    // Edit a draft cell: the input carries a display value; store its base.
    editDraftCell(ri, colId, value) {
      const col = actions.draftColumns.find((c) => c.id === colId);
      if (!col) return;
      let base = value;
      if (value !== "" && col.dimension) {
        const n = Number(value);
        base = col.displayUnit
          ? toBase(artifact, col.dimension, col.displayUnit, n, nonlinearFns(artifact, session.getEngine()))
          : n;
      }
      getView().draftRows[ri][colId] = base;
      actions.normalizeDraft();
    },

    addDraftRow(row) {
      getView().draftRows.push(row);
      actions.normalizeDraft();
    },

    removeDraftRow(ri) {
      getView().draftRows.splice(ri, 1);
      actions.normalizeDraft();
    },

    patchDraftRow(ri, patch) {
      Object.assign(getView().draftRows[ri], patch);
    },

    // Inspector field edits (shared by the draft cards). `scale` converts a
    // display input to base (percent inputs use 0.01). Empty clears the field.
    setMaltField(ri, field, value, scale = 1) {
      if (value === "") {
        actions.patchDraftRow(ri, { [field]: undefined });
        return;
      }
      const n = Number(value);
      actions.patchDraftRow(ri, { [field]: Number.isFinite(n) ? n * scale : 0 });
    },

    // Color (grain_color) edits in the master unit (Lovibond/EBC) and stores base
    // (Lovibond). The malt/trace inspectors bind to these instead of the raw
    // color_lovibond value, mirroring the collection grids' unit handling.
    colorUnit() {
      const unitId = actions.grainColorUnit();
      return unitSymbol(UNIT_SYMBOLS, "grain_color", unitId);
    },

    grainColorUnit() {
      return preferredUnit(getView().unitMode, "grain_color", "EBC");
    },

    colorDisplay(value) {
      if (typeof value !== "number" || !Number.isFinite(value)) return "";
      return roundTo(displayValue(artifact, "grain_color", actions.grainColorUnit(), value), 1);
    },

    setColorField(ri, value) {
      if (value === "") {
        actions.patchDraftRow(ri, { color_lovibond: undefined });
        return;
      }
      const n = Number(value);
      actions.patchDraftRow(ri, {
        color_lovibond: Number.isFinite(n)
          ? toBase(artifact, "grain_color", actions.grainColorUnit(), n)
          : 0,
      });
    },
  };

  Object.defineProperties(actions, {
    draftDirty: {
      configurable: true,
      get() {
        return getView().draftOpen && getView().draftBaseline !== actions.draftSnapshot();
      },
    },
    draftColumns: {
      configurable: true,
      get() {
        if (!getView().draftNodeId) return [];
        const columns = resolveCollectionColumns(
          artifact,
          registry,
          getView().draftNodeId,
          actions.draftEntry(),
          ui.unitMode
        );
        if (getView().draftNodeId === N.sugars) {
          const shareMode =
            session.getEngine().get(N.lateAdditionIntent) === "share";
          const visible = columns
            .filter((column) =>
              shareMode ? column.id !== "mass_kg" : column.id !== "resolved_mass_kg"
            )
            .map((column) =>
              column.id === "resolved_mass_kg" ? { ...column, label: "Mass" } : column
            );
          for (const column of visible) {
            if (column.id === "mass_kg") column.editable = !shareMode;
            if (column.id === "parts") column.editable = shareMode;
          }
          return visible;
        }
        if (getView().draftNodeId === H.whirlpoolCollection) {
          const at = columns.findIndex((column) => column.id === "initial_temp_c");
          const tempColumn = columns[at];
          if (tempColumn) {
            columns.splice(at + 1, 0, {
              ...tempColumn,
              id: "ceiling_c",
              label: "Max",
              editable: false,
            });
          }
        }
        return columns;
      },
    },
    draftCeilings: {
      configurable: true,
      get() {
        if (getView().draftNodeId !== H.whirlpoolCollection) return [];
        const engine = session.getEngine();
        return whirlpoolDraftCeilings({
          rows: getView().draftRows,
          startTempC: engine.get(H.whirlpoolStartTemp),
          ambientC: engine.get(H.whirlpoolAmbient),
          kPerMin: 1 / engine.get(H.whirlpoolCoolingTimeConstant),
          knockoutMin: engine.get(H.whirlpoolKnockout),
        });
      },
    },
    draftDisplayRows: {
      configurable: true,
      get() {
        const columns = actions.draftColumns;
        const nl = nonlinearFns(artifact, session.getEngine());
        const resolved = actions.draftResolvedRows();
        const ceilings = actions.draftCeilings;
        return getView().draftRows.map((row, ri) => {
          const out = { ...row };
          for (const col of columns) {
            const value = draftCellDisplay(
              artifact,
              col,
              draftCellValue(col, row, ri, resolved, ceilings),
              nl
            );
            if (!(col.editable && typeof getView().inputDraft === "function")) {
              out[col.id] = value;
              continue;
            }
            const key = `draft:${getView().draftNodeId}:${ri}:${col.id}`;
            out[col.id] = getView().inputDraft(key, value);
          }
          out.ceiling_above = ceilings[ri]?.above === true;
          return out;
        });
      },
    },
  });
  return actions;
}

export const KEYS = ["draftOpen", "draftNodeId", "draftRows", "draftBaseline", "draftDiscardOpen", "draftDirty", "draftEntry", "draftSnapshot", "draftMassDisplay", "openDraft", "closeDraft", "dismissDraftDiscard", "confirmDraftDiscard", "saveDraft", "normalizeDraft", "draftResolvedRows", "seedSugarShareWeights", "editDraftCell", "addDraftRow", "removeDraftRow", "patchDraftRow", "setMaltField", "colorUnit", "grainColorUnit", "colorDisplay", "setColorField", "draftColumns", "draftCeilings", "draftDisplayRows", ...CATALOG_CHROME_KEYS];
