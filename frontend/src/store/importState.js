// The store's readouts over the pure state model: every surface asks these, so a
// badge, a message, a section issue and the gate's freshness cannot disagree.

import { gateState, rowState, sectionState } from "../views/import/state.js";

export function stateReadouts() {
  return {
    rowState(row) {
      return rowState(row, {
        resolves: (candidate) => !this.isDangling(candidate),
        label: (candidate) => this.refLabel(candidate),
        blendMode: this.blendMode,
      });
    },

    isUndecided(row) {
      return Boolean(row) && this.rowState(row).blocks;
    },

    rowIssue(row) {
      return this.rowState(row).message;
    },

    sectionState(sectionId) {
      return sectionState(sectionId, this.sectionFacts(sectionId));
    },

    sectionFacts(sectionId) {
      if (sectionId === "yeasts") {
        return {
          lines: this.yeastLines.length,
          hasCarrier: Boolean(this.yeastOutcome),
          blendMode: this.blendMode,
        };
      }
      if (sectionId === "hops") {
        return {
          whirlpoolPicked: this.ledger.some(
            (row) => row.destination === "batch.whirlpool_hops" && row.decision === "mapped"
          ),
          hasSplit: (this.poolFraction ?? this.printedPoolFraction) != null,
        };
      }
      return {};
    },

    // A multi-strain recipe with a blend record to propose: the strains are components
    // and the blend is the decision.
    get blendMode() {
      return this.yeastLines.length > 1 && this.blendRecords.length > 0;
    },

    // One pick for the group: the blend lands on a yeast line, and the recipe's other
    // strains become its documented components.
    chooseBlend(chip) {
      if (!chip) return;
      const line =
        this.yeastLines.find((row) => row.decision === "unresolved") ??
        this.yeastLines.find((row) => row.decision !== "ignored") ??
        this.yeastLines[0];
      if (!line) return;
      this.chooseRef(line.line_id, chip);
    },

    get sectionIssues() {
      return [...this.sectionState("yeasts").issues, ...this.sectionState("hops").issues];
    },

    // What the header counts: rows that block, plus section decisions still owed.
    get openCount() {
      return this.unresolved.length + this.sectionIssues.length;
    },

    get gateState() {
      return gateState({
        gate: this.gate,
        revision: this.revision,
        checking: this.checkBusy,
        open: this.unresolved.length + this.sectionIssues.length > 0,
      });
    },
  };
}
