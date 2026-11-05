// The store's readouts over the pure state model: every surface asks these, so a
// badge, a message, a section issue and the gate's freshness cannot disagree.

import { gateState, rowState, sectionState } from "../views/import/state.js";

export function stateReadouts() {
  return {
    rowState(row) {
      return rowState(row, {
        resolves: (candidate) => !this.isDangling(candidate),
        label: (candidate) => this.refLabel(candidate),
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
          yeastPicked: this.mappedYeasts.length,
          hasCarrier: Boolean(this.yeastOutcome),
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

    get sectionIssues() {
      return [...this.sectionState("yeasts").issues, ...this.sectionState("hops").issues];
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
