// Presentation metadata for the dry-hopping slice. The card records three axes
// — application event, contact time, and hop type — and nothing here is solved:
// the calculator has no fermentation model.

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
  hop_application_event: {
    pitch: "At pitch",
    high_krausen: "High krausen",
    mid_fermentation: "Mid-fermentation",
    terminal: "Terminal gravity",
    post_diacetyl: "Post-diacetyl",
    cold_crash: "Cold crash",
    packaging: "Packaging",
  },
  hop_contact_until: {
    terminal_gravity: "Terminal gravity",
    vdk_clearance: "VDK clearance",
    hop_creep_plateau: "Hop-creep plateau",
    biotransformation_equilibrium: "Biotransformation equilibrium",
    next_charge: "Next charge",
    cold_crash: "Cold crash",
    packaging: "Packaging",
  },
  hop_unit: {
    oz: "oz",
    g: "g",
    ml: "ml",
  },
};

