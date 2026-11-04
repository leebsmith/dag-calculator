// The one strain a batch carries.
//
// A page may name a blend; the model has a single `batch.yeast` selection. The
// ledger finding names every mapped strain, and this is the decision it offers:
// pick the one that ferments, and mark the others not used rather than erasing
// them. The gate is dropped because a solved screen would otherwise stand on a
// ledger that changed underneath it.

import { ignoreRow } from "../views/import/ledger.js";

export function yeastActions({ catalog = () => null } = {}) {
  return {
    // The recipe's own fact, written with the decision. The engine reads one
    // selection; this is what the record says about how it got there.
    setYeastOutcome(outcome) {
      if (!this.record) return;
      this.record = { ...this.record, yeast_outcome: outcome };
      this.dirty = true;
      this.gate = null;
      this.delta = null;
      this.checkError = null;
    },

    keepOnlyYeast(lineId) {
      const kept = this.ledger.find((row) => row.line_id === lineId);
      if (!kept) return;
      // The batch carries the record, not the page's words: a blend record's name
      // is what the ledger should point the dropped strain at.
      const carried = kept.ref ? catalog("yeast", kept.ref) : null;
      const name = carried?.name ?? kept.name;
      const others = this.ledger.filter(
        (row) => row.section === "yeasts" && row.decision === "mapped" && row.line_id !== lineId
      );
      for (const row of others) {
        this.replaceRow(ignoreRow(row, `not in this batch — the batch ferments with ${name}`));
      }
      this.setYeastOutcome({ mode: "single", line_id: lineId });
    },
  };
}
