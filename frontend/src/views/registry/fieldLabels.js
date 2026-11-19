// Presentation labels for schema keys. One resolver for the Library editors,
// record validation messages, and import verification so a raw key never
// reaches a reader. Curated names win; the fallback humanizes the key.

const LABELS = {
  abv: "ABV",
  fg: "FG",
  ibu: "IBU",
  id: "ID",
  og: "OG",
  ph: "pH",
  srm: "Colour",
  tds: "TDS",
  url: "URL",
  name: "Name",
  description: "Description",
  notes: "Notes",
  type: "Type",
  category: "Category",
  category_id: "Category ID",
  category_name: "Category name",
  form: "Form",
  mode: "Mode",
  location: "Location",
  laboratory: "Laboratory",
  history: "History",
  comments: "Comments",
  aroma: "Aroma",
  appearance: "Appearance",
  flavor: "Flavor",
  mouthfeel: "Mouthfeel",
  tags: "Tags",
  volume: "Fermenter volume",
  duration_min: "Duration",
  boil_time_min: "Boil time",
  measured_at: "Measured",
  equipment_id: "Equipment",
  ambient_temp_c: "Ambient temperature",
  start_temp_c: "Start temperature",
  time_min: "Time",
  temp_c: "Temperature",
  points: "Points",
  overall_impression: "Overall impression",
  characteristic_ingredients: "Characteristic ingredients",
  style_comparison: "Style comparison",
  entry_instructions: "Entry instructions",
  commercial_examples: "Commercial examples",
  og_min: "OG min",
  og_max: "OG max",
  fg_min: "FG min",
  fg_max: "FG max",
  ibu_min: "IBU min",
  ibu_max: "IBU max",
  srm_min: "SRM min",
  srm_max: "SRM max",
  abv_min: "ABV min",
  abv_max: "ABV max",
  standard_malt: "Standard malt",
  standard_name: "Standard name",
  generic_description: "Generic description",
  yield_fraction: "Yield",
  fermentability_fraction: "Fermentability",
  fermentability_basis: "Fermentability basis",
  fermentability_method: "Fermentability method",
  moisture_fraction: "Moisture",
  color_lovibond: "Color",
  maltster: "Maltster",
  attenuation_cap_pct: "Attenuation cap",
  attenuation_low_pct: "Attenuation low",
  attenuation_high_pct: "Attenuation high",
  attenuation_basis: "Attenuation basis",
  blend_of: "Blend of",
  flocculation: "Flocculation",
  alcohol_tolerance: "Alcohol tolerance",
  temp_low_c: "Temperature low",
  temp_high_c: "Temperature high",
  sta1: "STA1 (vendor QC)",
  pof: "POF",
  recipes: "Recipes",
  recipes_count: "Recipes",
  alpha_rating: "Alpha rating",
  alpha_acid_pct: "Alpha acid",
  alpha_acid_min_pct: "Alpha acid min",
  alpha_acid_max_pct: "Alpha acid max",
  beta_acid_pct: "Beta acid",
  beta_acid_min_pct: "Beta acid min",
  beta_acid_max_pct: "Beta acid max",
  total_oil_ml_per_100g: "Total oil (mL/100 g)",
  total_oil_min_ml_per_100g: "Total oil min (mL/100 g)",
  total_oil_max_ml_per_100g: "Total oil max (mL/100 g)",
  cohumulone_pct_of_alpha: "Cohumulone",
  myrcene_pct_of_oil: "Myrcene",
  humulene_pct_of_oil: "Humulene",
  caryophyllene_pct_of_oil: "Caryophyllene",
  farnesene_pct_of_oil: "Farnesene",
  linalool_pct_of_oil: "Linalool",
  geraniol_pct_of_oil: "Geraniol",
  alpha_acid_basis: "Alpha acid basis",
  pairings: "Pairings",
  flavor_profiles: "Flavor profiles",
  product_form: "Product form",
  max_kettle_volume_l: "Max kettle volume",
  max_mash_tun_volume_l: "Max mash tun volume",
  max_hlt_volume_l: "Max HLT volume",
  mash_dead_space_l: "Mash dead space",
  mash_transfer_loss_l: "Mash transfer loss",
  kettle_dead_space_l: "Kettle dead space",
  kettle_transfer_loss_l: "Kettle transfer loss",
  trub_loss_l: "Trub loss",
  hlt_dead_space_l: "HLT dead space",
  hlt_transfer_loss_l: "HLT transfer loss",
  hlt_coil_floor_l: "HLT coil floor",
  nominal_boil_off_rate_l_per_hr: "Nominal boil-off rate",
  grain_absorption_factor_l_per_kg: "Grain absorption",
  mash_heating_rate_c_per_min: "Mash heating rate",
  min_lgr_l_per_kg: "Minimum L/G ratio",
  nominal_conversion_efficiency: "Nominal conversion efficiency",
  shrinkage_pct: "Shrinkage",
  mash_tun_specific_heat: "Mash tun specific heat",
  mash_tun_mass_kg: "Mash tun mass",
  max_volume_l: "Max volume",
  nominal_volume_l: "Nominal volume",
  date_received: "Date received",
  date_reported: "Date reported",
  sample_id: "Sample ID",
  source_name: "Source name",
  electrical_conductivity_mmho_cm: "Electrical conductivity",
  calcium_ca: "Calcium",
  magnesium_mg: "Magnesium",
  sodium_na: "Sodium",
  potassium_k: "Potassium",
  chloride_cl: "Chloride",
  sulfate_so4: "Sulfate",
  bicarbonate_hco3: "Bicarbonate",
  total_alkalinity_caco3: "Total alkalinity",
  total_hardness_caco3: "Total hardness",
  nitrate_no3_n: "Nitrate (NO3-N)",
  total_phosphorus_p: "Total phosphorus",
  total_iron_fe: "Total iron",
  alkalinity_as_caco3: "Alkalinity",
  calcium_floor_ppm: "Calcium floor",
};

const WORDS = {
  abv: "ABV",
  fg: "FG",
  ibu: "IBU",
  id: "ID",
  og: "OG",
  ph: "pH",
  srm: "SRM",
  tds: "TDS",
  url: "URL",
  pct: "%",
  ml: "mL",
  l: "L",
  kg: "kg",
  g: "g",
  mg: "mg",
  ppm: "ppm",
  min: "min",
  caco3: "CaCO3",
  hco3: "HCO3",
  so4: "SO4",
  no3: "NO3",
  c: "C",
  f: "F",
};

/**
 * A schema key as a reader-facing label. Curated names win; unknown keys are
 * split on underscores and title-cased so a raw key never reaches the UI.
 * @pure
 * @param {string|null|undefined} key
 * @returns {string}
 */
export function fieldLabel(key) {
  const raw = String(key ?? "").trim();
  if (!raw) return "";
  if (LABELS[raw]) return LABELS[raw];
  const words = raw.split("_").filter(Boolean);
  return words
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (WORDS[lower]) return WORDS[lower];
      return index === 0
        ? lower.charAt(0).toUpperCase() + lower.slice(1)
        : lower;
    })
    .join(" ");
}

/**
 * A field path as a label: `targets.ibu` -> `IBU`, `mashes[0].duration_min` ->
 * `Duration`. The leaf is the schema key; prefixes are transport only.
 * @pure
 * @param {string|null|undefined} path
 * @returns {string}
 */
export function fieldLabelFromPath(path) {
  const leaf = String(path ?? "")
    .replace(/\[\d+\]/g, "")
    .split(".")
    .at(-1);
  return fieldLabel(leaf);
}

/**
 * A validation error as one line: friendly field label, or no prefix for a
 * form-level (`*`) error.
 * @pure
 * @param {{ readonly field?: string|null, readonly message?: string|null }|null|undefined} error
 * @returns {string}
 */
export function fieldErrorText(error) {
  const message = String(error?.message ?? "");
  const field = error?.field;
  if (!field || field === "*") return message;
  const label = fieldLabelFromPath(field);
  return label ? `${label}: ${message}` : message;
}
