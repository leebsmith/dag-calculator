// Presentation metadata for the water-chemistry slice (pickers, ion roots,
// choices, and solver.water readouts).
export const waterRegistry = {
  "water.source_report_id": { label: "Source report" },
  "water.target_profile_id": { label: "Target profile" },

  "water.source.calcium_ca": { label: "Calcium", unit: "ppm" },
  "water.source.magnesium_mg": { label: "Magnesium", unit: "ppm" },
  "water.source.sodium_na": { label: "Sodium", unit: "ppm" },
  "water.source.sulfate_so4": { label: "Sulfate", unit: "ppm" },
  "water.source.chloride_cl": { label: "Chloride", unit: "ppm" },
  "water.source.alkalinity_as_caco3": { label: "Alkalinity (as CaCO3)", unit: "ppm" },

  "water.target.calcium_ca": { label: "Calcium", unit: "ppm" },
  "water.target.magnesium_mg": { label: "Magnesium", unit: "ppm" },
  "water.target.sodium_na": { label: "Sodium", unit: "ppm" },
  "water.target.sulfate_so4": { label: "Sulfate", unit: "ppm" },
  "water.target.chloride_cl": { label: "Chloride", unit: "ppm" },
  "water.target.alkalinity_as_caco3": { label: "Alkalinity (as CaCO3)", unit: "ppm" },

  "water.strategy": { label: "Strategy" },
  "water.salt_distribution": { label: "Salt distribution" },
  "water.acid_medium": { label: "Acid medium" },
  "water.gypsum_form": { label: "Gypsum form" },
  "water.cacl2_form": { label: "CaCl2 form" },
  "water.preferred_alkaline_agent": { label: "Alkaline agent" },
  "water.calcium_floor_ppm": { label: "Calcium floor", unit: "ppm" },
  "water.target_mash_ph": { label: "Target mash pH", unit: "pH" },
  "water.v_hlt_treat_l": { label: "HLT treat volume", unit: "L" },

  "solver.water.prescription.predicted_mash_ph": { label: "Predicted mash pH", unit: "pH" },
  "solver.water.prescription.mash_ph_status": { label: "Mash pH status" },
};
