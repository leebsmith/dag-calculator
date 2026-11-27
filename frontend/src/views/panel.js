// The determination panel: six outcome cells, the inline context line with its
// report-faithful details popover, and the solver groups. The map gives every
// read-out a panel home; the panel renders the determinations that earn their
// space, and the report carries the rest. Every rendered path is declared here
// once and the coverage guard proves it is read-only. Labels come from
// data/labels.json with a curated fallback.

export const strip = [
  { id: "abv", label: "ABV", path: "batch.realized_abv", axis: "abv" },
  { id: "og", label: "OG", path: "solver.batch.sg_post_boil", axis: "og" },
  { id: "fg", label: "FG", path: "batch.realized_fg", axis: "fg" },
  { id: "ibu", label: "IBU", path: "batch.hop_realized_ibu", axis: null },
  { id: "srm", label: "SRM", path: "grist.finished_beer_srm", axis: null },
  { id: "ph", label: "Mash pH", path: "solver.water.prescription.predicted_mash_ph", axis: null },
];

export const context = {
  equipment: [
    {
      id: "mash-tun",
      title: "Mash tun",
      rows: [
        { path: "equipment.max_mash_tun_volume_l", label: "Maximum volume" },
        { path: "equipment.mash_dead_space_l", label: "Dead space" },
        { path: "equipment.mash_transfer_loss_l", label: "Transfer loss" },
        { path: "equipment.mash_tun_mass_kg", label: "Tun mass" },
        { path: "equipment.mash_tun_specific_heat", label: "Tun specific heat" },
        { path: "equipment.mash_heating_rate_c_per_min", label: "Ramp rate" },
        { path: "equipment.min_lgr_l_per_kg", label: "Minimum liquor-to-grist" },
      ],
    },
    {
      id: "kettle",
      title: "Kettle",
      rows: [
        { path: "equipment.max_kettle_volume_l", label: "Maximum volume" },
        { path: "equipment.kettle_dead_space_l", label: "Dead space" },
        { path: "equipment.kettle_transfer_loss_l", label: "Transfer loss" },
        { path: "equipment.trub_loss_l", label: "Trub" },
      ],
    },
    {
      id: "hlt",
      title: "Hot liquor tank",
      rows: [
        { path: "equipment.max_hlt_volume_l", label: "Maximum volume" },
        { path: "equipment.hlt_dead_space_l", label: "Dead space" },
        { path: "equipment.hlt_transfer_loss_l", label: "Transfer loss" },
        { path: "equipment.hlt_coil_floor_l", label: "Coil floor" },
      ],
    },
    {
      id: "brewhouse",
      title: "Brewhouse",
      rows: [
        { path: "equipment.nominal_boil_off_rate_l_per_hr", label: "Boil-off rate" },
        { path: "equipment.shrinkage_pct", label: "Shrinkage" },
        { path: "equipment.nominal_conversion_efficiency", label: "Conversion efficiency" },
        { path: "equipment.grain_absorption_factor_l_per_kg", label: "Grain absorption" },
      ],
    },
  ],
  brewhouse: [
    { path: "batch.topology", label: "Constraint" },
    { path: "solver.batch.mash_thickness_l_per_kg", label: "Liquor-to-grist ratio" },
    { path: "batch.runnings_ratio", label: "Runnings ratio (r)" },
    { path: "batch.conversion_efficiency", label: "Conversion efficiency" },
    { path: "solver.batch.brewhouse_efficiency", label: "Brewhouse efficiency" },
    { path: "batch.boil_time_min", label: "Boil time" },
    { path: "batch.boil_off_rate_l_per_hr", label: "Boil-off rate" },
    { path: "batch.grain_moisture_fraction", label: "Grain moisture" },
  ],
};

export const groups = [
  {
    id: "batch",
    title: "Batch",
    rows: [
      { path: "grist.total_mass", label: "Grist" },
      { path: "solver.batch.brewhouse_efficiency", label: "Brewhouse efficiency" },
      { path: "solver.batch.v_pre_boil", label: "Pre-boil volume" },
      { path: "batch.total_water_used", label: "Total water used" },
      { path: "batch.sugar_extract_total", label: "Late sugar extract" },
      { path: "batch.yeast_cap", label: "Yeast attenuation cap" },
      { path: "batch.attenuation_above_cap", label: "Above malt cap" },
    ],
  },
  {
    id: "bitterness",
    title: "Bitterness",
    rows: [
      { path: "batch.boil_target_ibu", label: "Boil" },
      { path: "batch.whirlpool_target_ibu", label: "Whirlpool" },
      { path: "batch.hop_hot_mass_share", label: "Hot share" },
      { path: "batch.hop_cool_mass_share", label: "Cool share" },
      { path: "batch.bract_floor_kg", label: "Bract floor" },
      { path: "batch.bract_shortfall_kg", label: "Bract shortfall" },
    ],
  },
  {
    id: "water",
    title: "Water",
    rows: [
      { path: "solver.water.prescription.mash_ph_status", label: "pH status" },
      { path: "solver.water.prescription.residual_hlt_water_l", label: "Treated liquor left" },
      { path: "batch.sparge_salted_volume", label: "Salted sparge volume" },
      { path: "solver.water.mash_additions.gypsum_kg", label: "Mash gypsum", unit: "g" },
      { path: "solver.water.mash_additions.cacl2_kg", label: "Mash calcium chloride", unit: "g" },
      { path: "solver.water.mash_additions.acid_l", label: "Mash acid", unit: "ml" },
      { path: "solver.water.sparge_additions.acid_l", label: "Sparge acid", unit: "ml" },
    ],
  },
  {
    id: "style",
    title: "Style",
    computed: "conformance",
    rows: [],
  },
  { id: "findings", title: "Findings", findings: true },
];

/** Every path the panel renders; the computed Style group contributes its own. */
export const panelPaths = [
  ...strip.map((cell) => cell.path),
  ...context.equipment.flatMap((group) => group.rows.map((row) => row.path)),
  ...groups.flatMap((group) => (group.rows ?? []).map((row) => row.path)),
];
