// The imported recipe's yeast lines, and the one this batch ferments with.
//
// A batch carries one yeast selection. Blends are Library records — a yeast record
// with a composition — so the mapping phase only has to say which of the recipe's
// picked strains is the carrier. Rows stay uniform: picking a second strain does not
// demote the first, it asks the section for a decision.

export function yeastReadouts() {
  return {
    get yeastLines() {
      return this.ledger.filter((row) => row.section === "yeasts");
    },

    get mappedYeasts() {
      return this.yeastLines.filter((row) => row.decision === "mapped");
    },

    // The carrier: the one line the batch ferments with. Stored on the record and
    // reconciled against the rows, so a left-out carrier cannot linger.
    get yeastOutcome() {
      const stated = this.record?.yeast_outcome ?? null;
      // A blend is a Library record the batch carries; it is never one of the recipe's
      // lines, so it has no line to point at.
      if (stated?.mode === "blend" && stated.ref && this.catalogRecord("yeast", stated.ref)) {
        return stated;
      }
      const mapped = this.mappedYeasts.map((row) => row.line_id);
      if (stated?.mode === "single" && mapped.includes(stated.line_id)) return stated;
      return mapped.length === 1 ? { mode: "single", line_id: mapped[0] } : null;
    },

    get blendOutcome() {
      const outcome = this.yeastOutcome;
      return outcome?.mode === "blend" ? outcome : null;
    },

    get blendRecordAttenuationPct() {
      const blend = this.blendOutcome;
      const record = blend ? this.catalogRecord("yeast", blend.ref) : null;
      const value = record?.attenuation_cap_pct;
      return typeof value === "number" ? Math.round(value * 1000) / 10 : null;
    },

    get carrierLineId() {
      return this.yeastOutcome?.mode === "single" ? this.yeastOutcome.line_id : null;
    },

    get carrier() {
      const id = this.carrierLineId;
      return id ? this.yeastLines.find((row) => row.line_id === id) ?? null : null;
    },

    // Kept as the readout the row badge binds to: a picked strain is the batch's
    // yeast only when it is the carrier.
    get fermentingYeastId() {
      return this.carrierLineId;
    },

    get yeastSectionOpen() {
      return this.mappedYeasts.length > 1 && !this.yeastOutcome;
    },
  };
}
