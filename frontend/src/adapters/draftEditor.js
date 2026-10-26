// Collection draft editor: scratch-copy state, normalization, unit-aware cell
// edits, and the draft-row helpers shared by the catalog modals. The app-facing
// method names are unchanged so partials and tests keep their bindings.

import { toBase } from "../engine/index.js";
import { hamiltonPct } from "../views/hamilton.js";
import { displayValue, nonlinearFns, resolveCollectionColumns } from "../views/producer.js";
import { registry, steps } from "../views/steps.js";
import { UNIT_SYMBOLS } from "../views/registry/units.js";
import { SYSTEM_NODES as N } from "../views/registry/system.js";
import { formatWithDecimals, preferredUnit, unitSymbol } from "../utils.js";

// AI AGENT HOOKS: Use this installer for every draft-editor state transition,
// draft-row normalization, and unit-aware draft cell read/write. Do not
// duplicated this logic elsewhere.
export function installDraftEditor(app, { artifact, ui, session }) {
  Object.assign(app, {
    draftOpen: false,
    draftNodeId: "",
    draftRows: [],

    draftEntry() {
      for (const step of steps) {
        for (const entry of step.fields) {
          if (entry && typeof entry === "object" && entry.collection === this.draftNodeId) return entry;
        }
      }
      return {};
    },

    // Draft total (mass-unit aware) for the modal header / totals row. Sums
    // `pick(row)` over the draft and formats it in the mass column's display
    // unit (used by the late-additions and trace-malt editors).
    draftMassDisplay(pick) {
      const col = this.draftColumns.find((c) => c.id === "mass_kg");
      const total = (this.draftRows ?? []).reduce((sum, r) => sum + (pick(r) || 0), 0);
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
      this.draftNodeId = nodeId;
      this.draftRows = JSON.parse(JSON.stringify(session.getEngine().get(nodeId) ?? []));
      this.normalizeDraft();
      this.draftOpen = true;
    },

    closeDraft() {
      this.draftOpen = false;
      this.draftRows = [];
      this.draftNodeId = "";
    },

    saveDraft() {
      session.engine.setCollection(
        this.draftNodeId,
        JSON.parse(JSON.stringify(this.normalizeDraft()))
      );
      this.closeDraft();
      this.scheduleSolve();
      this.notify();
    },

    // AI AGENT HOOKS: Use this normalizer for every draft row collection that
    // derives its shares from `parts`. Do not duplicated this logic elsewhere.
    normalizeDraft() {
      if (
        (this.draftNodeId === N.majorMalts ||
          this.draftNodeId === N.boilHops ||
          this.draftNodeId === N.whirlpoolHops) &&
        this.draftRows.length
      ) {
        const pcts = hamiltonPct(this.draftRows.map((r) => r.parts));
        this.draftRows.forEach((r, i) => {
          r.pct = pcts[i];
        });
      }
      return this.draftRows;
    },

    // Edit a draft cell: the input carries a display value; store its base.
    editDraftCell(ri, colId, value) {
      const col = this.draftColumns.find((c) => c.id === colId);
      if (!col) return;
      let base = value;
      if (value !== "" && col.dimension) {
        const n = Number(value);
        base = col.displayUnit
          ? toBase(artifact, col.dimension, col.displayUnit, n, nonlinearFns(artifact, session.getEngine()))
          : n;
      }
      this.draftRows[ri][colId] = base;
      this.normalizeDraft();
    },

    addDraftRow(row) {
      this.draftRows.push(row);
      this.normalizeDraft();
    },

    removeDraftRow(ri) {
      this.draftRows.splice(ri, 1);
      this.normalizeDraft();
    },

    patchDraftRow(ri, patch) {
      Object.assign(this.draftRows[ri], patch);
    },

    // Inspector field edits (shared by the draft cards). `scale` converts a
    // display input to base (percent inputs use 0.01). Empty clears the field.
    setMaltField(ri, field, value, scale = 1) {
      if (value === "") {
        this.patchDraftRow(ri, { [field]: undefined });
        return;
      }
      const n = Number(value);
      this.patchDraftRow(ri, { [field]: Number.isFinite(n) ? n * scale : 0 });
    },

    // Color (grain_color) edits in the master unit (Lovibond/EBC) and stores base
    // (Lovibond). The malt/trace inspectors bind to these instead of the raw
    // color_lovibond value, mirroring the collection grids' unit handling.
    colorUnit() {
      const unitId = this.grainColorUnit();
      return unitSymbol(UNIT_SYMBOLS, "grain_color", unitId) ?? unitId;
    },

    grainColorUnit() {
      return preferredUnit(this.unitMode, "grain_color", "EBC");
    },

    colorDisplay(value) {
      if (typeof value !== "number" || !Number.isFinite(value)) return "";
      return Math.round(displayValue(artifact, "grain_color", this.grainColorUnit(), value) * 10) / 10;
    },

    setColorField(ri, value) {
      if (value === "") {
        this.patchDraftRow(ri, { color_lovibond: undefined });
        return;
      }
      const n = Number(value);
      this.patchDraftRow(ri, {
        color_lovibond: Number.isFinite(n)
          ? toBase(artifact, "grain_color", this.grainColorUnit(), n)
          : 0,
      });
    },
  });

  Object.defineProperties(app, {
    draftColumns: {
      configurable: true,
      get() {
        if (!this.draftNodeId) return [];
        const columns = resolveCollectionColumns(
          artifact,
          registry,
          this.draftNodeId,
          this.draftEntry(),
          ui.unitMode
        );
        if (this.draftNodeId === N.sugars) {
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
        return columns;
      },
    },
    draftDisplayRows: {
      configurable: true,
      get() {
        const columns = this.draftColumns;
        const nl = nonlinearFns(artifact, session.getEngine());
        return this.draftRows.map((row, ri) => {
          const out = { ...row };
          for (const col of columns) {
            let v = row[col.id];
            if (col.displayUnit && col.dimension && typeof v === "number") {
              v = displayValue(artifact, col.dimension, col.displayUnit, v, nl);
            }
            if (typeof v === "number") {
              v = formatWithDecimals(v, col.decimals);
            }
            if (col.editable && typeof this.inputDraft === "function") {
              const key = `draft:${this.draftNodeId}:${ri}:${col.id}`;
              out[col.id] = this.inputDraft(key, v);
            } else {
              out[col.id] = v;
            }
          }
          return out;
        });
      },
    },
  });
}

export const KEYS = ["draftOpen", "draftNodeId", "draftRows", "draftEntry", "draftMassDisplay", "openDraft", "closeDraft", "saveDraft", "normalizeDraft", "editDraftCell", "addDraftRow", "removeDraftRow", "patchDraftRow", "setMaltField", "colorUnit", "grainColorUnit", "colorDisplay", "setColorField", "draftColumns", "draftDisplayRows"];
