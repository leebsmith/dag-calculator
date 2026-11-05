// The imported recipe's yeasts: which strain the batch ferments with.
//
// A blend is a Library record, not something created here. This module owns the one
// decision mapping has to make — the carrier — and nothing writes to the Library.

import { ignoreRow } from "../views/import/ledger.js";

export function yeastActions() {
  return {
    // The recipe's own fact, written with the decision. The engine reads one
    // selection; this is what the record says about how it got there.
    setYeastOutcome(outcome) {
      if (!this.record) return;
      this.record = { ...this.record, yeast_outcome: outcome };
      this.dirty = true;
      this.checkError = null;
      this.revision += 1;
    },

    // A blend record names its components, so the recipe's other yeast lines are
    // represented by it. They are left out with that reason — visible, reversible, and
    // not blocking a gate whose decision is already made.
    representYeastComponents(lineId, blend) {
      for (const row of this.yeastLines) {
        if (row.line_id === lineId) continue;
        if (row.decision === "mapped" || row.decision === "ignored") continue;
        this.replaceRow(ignoreRow(row, `represented by ${blend.name}`));
      }
    },

    // Choosing the carrier is a section decision, not a row demotion: the other
    // picked strains stay picked and are simply not the batch's yeast.
    setCarrier(lineId) {
      const row = this.ledger.find((candidate) => candidate.line_id === lineId);
      if (!row || row.decision !== "mapped") return;
      this.setYeastOutcome({ mode: "single", line_id: lineId });
    },
  };
}
