// Presentation metadata for the dry-hopping slice: hop form and unit labels. The
// schedule vocabulary and its labels live in views/dryHopSchedule.js.

export const DRY_HOP_NODES = {
  collection: "batch.dry_hops",
  slice: "hops",
};

// Display names for the enumerated row values. The values themselves are the
// artifact's; the labels are presentation only.
export const DRY_HOP_VALUE_LABELS = {
  hop_product_form: {
    whole_cone: "Whole cone",
    t90_pellet: "T-90 pellet",
    lupulin_pellet: "Lupulin concentrate",
  },
  hop_unit: {
    oz: "oz",
    g: "g",
    ml: "ml",
  },
};

