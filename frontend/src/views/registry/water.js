// Presentation metadata for the water-chemistry slice (pickers, ion readouts,
// choices, and solver.water readouts).
export const WATER_NODES = {
  slice: "water",
  saltDistribution: "water.salt_distribution",
  gypsumForm: "water.gypsum_form",
  cacl2Form: "water.cacl2_form",
  acidMedium: "water.acid_medium",
  vMashTreat: "water.v_mash_treat_l",
  spargeSaltedVolume: "batch.sparge_salted_volume",
  vSpargeDeliverable: "solver.batch.hlt.v_sparge_deliverable",
  vRun1: "solver.batch.cascade.v_run1",
  vRun2: "solver.batch.cascade.v_run2",
  vSparge: "solver.batch.cascade.v_sparge",
  hltStart: "batch.hlt_starting_volume_l",
  surplusSpargeCapacity: "batch.surplus_sparge_capacity",
  residualHlt: "solver.water.prescription.residual_hlt_water_l",
  spargeTanninWarning: "solver.water.prescription.sparge_tannin_warning",
  mashAdditions: "solver.water.mash_additions",
  spargeAdditions: "solver.water.sparge_additions",
  postMashIons: "solver.water.post_salt_mash_ions",
  postHltIons: "solver.water.post_salt_hlt_ions",
  targetProfile: "water.target_profile",
};

export const waterRegistry = {
  "water.source_report_id": { label: "Source report" },
  "water.target_profile_id": { label: "Target profile" },

  "water.source_report.calcium_ca": { label: "Calcium", unit: "ppm" },
  "water.source_report.magnesium_mg": { label: "Magnesium", unit: "ppm" },
  "water.source_report.sodium_na": { label: "Sodium", unit: "ppm" },
  "water.source_report.sulfate_so4": { label: "Sulfate", unit: "ppm" },
  "water.source_report.chloride_cl": { label: "Chloride", unit: "ppm" },
  "water.source_report.total_alkalinity_caco3": { label: "Alkalinity (as CaCO3)", unit: "ppm" },

  "water.target_profile.calcium_ca": { label: "Calcium", unit: "ppm" },
  "water.target_profile.magnesium_mg": { label: "Magnesium", unit: "ppm" },
  "water.target_profile.sodium_na": { label: "Sodium", unit: "ppm" },
  "water.target_profile.sulfate_so4": { label: "Sulfate", unit: "ppm" },
  "water.target_profile.chloride_cl": { label: "Chloride", unit: "ppm" },
  "water.target_profile.alkalinity_as_caco3": { label: "Alkalinity (as CaCO3)", unit: "ppm" },
  "water.target_profile.calcium_floor_ppm": { label: "Calcium floor", unit: "ppm" },

  "water.strategy": { label: "Strategy" },
  "water.salt_distribution": {
    label: "Salt distribution",
    optionLabels: {
      PROPORTIONAL: "Split — grist and HLT",
      MASH_ONLY: "Mash only salts",
    },
  },
  "water.acid_medium": {
    label: "Acid medium",
    optionLabels: {
      LACTIC_88: "88% lactic acid",
      PHOSPHORIC_10: "10% phosphoric acid",
      PHOSPHORIC_85: "85% phosphoric acid",
    },
  },
  "water.gypsum_form": {
    label: "Gypsum form",
    optionLabels: {
      GYPSUM_DIHYDRATE: "Dihydrate (CaSO₄·2H₂O)",
      GYPSUM_ANHYDROUS: "Anhydrous (CaSO₄)",
    },
  },
  "water.cacl2_form": {
    label: "CaCl2 form",
    optionLabels: {
      CACL2_DIHYDRATE: "Dihydrate (CaCl₂·2H₂O)",
      CACL2_ANHYDROUS: "Anhydrous (CaCl₂)",
    },
  },
  "water.preferred_alkaline_agent": { label: "Alkaline agent" },
  "water.target_mash_ph": { label: "Target mash pH", unit: "pH" },
  "water.v_hlt_treat_l": { label: "Sparge salt dosing volume", unit: "L" },

  "solver.water.prescription.predicted_mash_ph": { label: "Predicted mash pH", unit: "pH" },
  "solver.water.prescription.mash_ph_status": { label: "Mash pH status" },
  "solver.water.prescription.residual_hlt_water_l": { label: "Residual HLT water", unit: "L" },

  "solver.water.mash_additions.gypsum_kg": { label: "Mash gypsum", displayUnit: "g" },
  "solver.water.mash_additions.cacl2_kg": { label: "Mash calcium chloride", displayUnit: "g" },
  "solver.water.mash_additions.epsom_kg": { label: "Mash Epsom salt", displayUnit: "g" },
  "solver.water.mash_additions.nacl_kg": { label: "Mash table salt", displayUnit: "g" },
  "solver.water.mash_additions.acid_l": { label: "Mash acid", displayUnit: "ml" },
  "solver.water.mash_additions.baking_soda_kg": { label: "Mash baking soda", displayUnit: "g" },
  "solver.water.mash_additions.chalk_kg": { label: "Mash chalk", displayUnit: "g" },
  "solver.water.mash_additions.pickling_lime_kg": { label: "Mash pickling lime", displayUnit: "g" },

  "solver.water.sparge_additions.gypsum_kg": { label: "Sparge gypsum", displayUnit: "g" },
  "solver.water.sparge_additions.cacl2_kg": { label: "Sparge calcium chloride", displayUnit: "g" },
  "solver.water.sparge_additions.epsom_kg": { label: "Sparge Epsom salt", displayUnit: "g" },
  "solver.water.sparge_additions.nacl_kg": { label: "Sparge table salt", displayUnit: "g" },
  "solver.water.sparge_additions.acid_l": { label: "Sparge acid", displayUnit: "ml" },
  "solver.water.sparge_additions.baking_soda_kg": { label: "Sparge baking soda", displayUnit: "g" },
  "solver.water.sparge_additions.chalk_kg": { label: "Sparge chalk", displayUnit: "g" },
  "solver.water.sparge_additions.pickling_lime_kg": { label: "Sparge pickling lime", displayUnit: "g" },
};
