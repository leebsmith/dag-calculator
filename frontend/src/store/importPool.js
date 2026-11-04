// The whirlpool IBU split: the one hop number a page rarely prints.
//
// A zero is not a neutral default — it would put the whole IBU budget in the boil
// while the whirlpool rows solve a zero mass — so the split is a decision with a
// provenance ("printed", "estimated", "authored") that the review always shows.

import { estimateWhirlpoolFraction, hopFindings } from "../views/import/hopRouting.js";

export function poolReadouts() {
  return {
    get poolFraction() {
      return this.record?.pool_ibu_fraction ?? null;
    },

    get poolSource() {
      return this.record?.pool_ibu_source ?? null;
    },

    // Printed IBUs beat any estimate; the estimate is only ever a suggestion.
    get printedPoolFraction() {
      const printed = this.ledger
        .filter((row) => row.destination === "batch.whirlpool_hops" && row.ibu_contribution != null)
        .reduce((sum, row) => sum + row.ibu_contribution, 0);
      const total = this.payload?.targets?.ibu?.value;
      return total > 0 && printed > 0 ? Math.min(1, printed / total) : null;
    },

    get estimatedPoolFraction() {
      return estimateWhirlpoolFraction(this.ledger);
    },

    get hopFindings() {
      return hopFindings({
        payload: this.payload,
        ledger: this.ledger,
        fraction: this.poolFraction ?? this.printedPoolFraction,
      });
    },
  };
}

export function poolActions() {
  return {
    setPoolFraction(value, source = "authored") {
      if (!this.record) return;
      const numeric = value === "" || value == null ? null : Number(value);
      const bounded = Number.isFinite(numeric) ? Math.min(1, Math.max(0, numeric)) : null;
      this.record = {
        ...this.record,
        pool_ibu_fraction: bounded,
        pool_ibu_source: bounded == null ? null : source,
      };
      this.dirty = true;
      this.error = null;
    },

    useEstimatedPoolFraction() {
      const estimate = this.estimatedPoolFraction;
      if (estimate != null) this.setPoolFraction(estimate, "estimated");
    },
  };
}
