// Presentation metadata for the style slice (identity declaration + targets).
export const STYLE_NODES = {
  fermentation: "batch.fermentation",
  envelope: {
    ogMin: "style.og_min",
    ogMax: "style.og_max",
    fgMin: "style.fg_min",
    fgMax: "style.fg_max",
    abvMin: "style.abv_min",
    abvMax: "style.abv_max",
    ibuMin: "style.ibu_min",
    ibuMax: "style.ibu_max",
    srmMin: "style.srm_min",
    srmMax: "style.srm_max",
  },
  targets: {
    srm: "batch.target_srm",
    ibu: "batch.target_ibu",
    whirlpoolFraction: "batch.whirlpool_ibu_fraction",
    boilIbu: "batch.boil_target_ibu",
    whirlpoolIbu: "batch.whirlpool_target_ibu",
  },
  realized: {
    og: "solver.batch.sg_post_boil",
    fg: "batch.realized_fg",
    abv: "batch.realized_abv",
    ibu: "batch.target_ibu",
    srm: "grist.finished_beer_srm",
  },
  apparentAttenuation: "batch.apparent_attenuation",
  targetAbv: "batch.target_abv",
  slice: "batch",
};

export const styleRegistry = {
  "batch.fermentation": {
    label: "Fermentation",
    optionLabels: {
      ale: "Ale",
      lager: "Lager",
      wild: "Wild",
      mixed: "Mixed",
    },
  },
  "style.og_min": { label: "OG min", displayUnit: "SG" },
  "style.og_max": { label: "OG max", displayUnit: "SG" },
  "style.fg_min": { label: "FG min", displayUnit: "SG" },
  "style.fg_max": { label: "FG max", displayUnit: "SG" },
  "style.ibu_min": { label: "IBU min", unit: "IBU" },
  "style.ibu_max": { label: "IBU max", unit: "IBU" },
  "style.srm_min": { label: "SRM min", unit: "SRM" },
  "style.srm_max": { label: "SRM max", unit: "SRM" },
  "style.abv_min": { label: "ABV min", unit: "%" },
  "style.abv_max": { label: "ABV max", unit: "%" },
};
