// Presentation metadata for the dry-hopping slice. The card records three axes
// — application event, contact time, and hop type — and nothing here is solved:
// the calculator has no fermentation model.

export const DRY_HOP_NODES = {
  collection: "batch.dry_hops",
  slice: "dry-hops",
};

// Display names for the enumerated row values. The values themselves are the
// artifact's; the labels are presentation only.
export const DRY_HOP_VALUE_LABELS = {
  hop_product_type: {
    t90_pellet: "T-90 pellet",
    lupulin_pellet: "Lupulin pellet",
    flowable_extract: "Flowable extract",
    terpene_isolate: "Terpene isolate",
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

export const dryHopsRegistry = {
  "batch.dry_hops": { label: "Dry hops" },
  "batch.dry_hops.variety": { label: "Hop" },
  "batch.dry_hops.product_type": { label: "Type" },
  "batch.dry_hops.quantity": { label: "Quantity" },
  "batch.dry_hops.unit": { label: "Unit" },
  "batch.dry_hops.application_stage": { label: "Stage" },
  "batch.dry_hops.application_event": { label: "Applied at" },
  "batch.dry_hops.contact_duration_min": { label: "Contact", displayUnit: "hr" },
  "batch.dry_hops.contact_until": { label: "Contact until" },
  "batch.dry_hops.time_of_application": { label: "Detail" },
  "batch.dry_hops.notes": { label: "Notes" },
};
