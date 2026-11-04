// The one strain a batch carries.
//
// A page may name a blend; the model has a single `batch.yeast` selection. The
// ledger finding names every mapped strain, and this is the decision it offers:
// keep one, and record the others as the co-pitch they were rather than erasing
// them. The gate is dropped because a solved screen would otherwise stand on a
// ledger that changed underneath it.

import { ignoreRow } from "../views/import/ledger.js";

export function yeastActions() {
  return {
    keepOnlyYeast(lineId) {
      const kept = this.ledger.find((row) => row.line_id === lineId);
      if (!kept) return;
      const others = this.ledger.filter(
        (row) => row.section === "yeasts" && row.decision === "mapped" && row.line_id !== lineId
      );
      for (const row of others) {
        this.replaceRow(ignoreRow(row, `co-pitch with ${kept.name}`));
      }
      this.gate = null;
      this.delta = null;
      this.checkError = null;
    },
  };
}
