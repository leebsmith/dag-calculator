// The imported recipe's yeasts: which strain the batch ferments with.
//
// A blend is a Library record, not something created here. This module owns the one
// decision mapping has to make — the carrier — and nothing writes to the Library.

export function yeastActions() {
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

    // Choosing the carrier is a section decision, not a row demotion: the other
    // picked strains stay picked and are simply not the batch's yeast.
    setCarrier(lineId) {
      const row = this.ledger.find((candidate) => candidate.line_id === lineId);
      if (!row || row.decision !== "mapped") return;
      this.setYeastOutcome({ mode: "single", line_id: lineId });
    },
  };
}
