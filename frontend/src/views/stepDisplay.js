// Display-only data for the shared step card: the sections a step groups its
// readouts into, and the resolver that pairs a step with its produced fields.
// Pure; the card partial binds the result through `stepGroups`.

export const equipmentSections = [
  {
    title: "Mash tun",
    fields: [
      "equipment.max_mash_tun_volume_l",
      "equipment.mash_dead_space_l",
      "equipment.mash_transfer_loss_l",
      "equipment.mash_tun_mass_kg",
      "equipment.mash_tun_specific_heat",
      "equipment.mash_heating_rate_c_per_min",
      "equipment.min_lgr_l_per_kg",
    ],
  },
  {
    title: "Kettle",
    fields: [
      "equipment.max_kettle_volume_l",
      "equipment.kettle_dead_space_l",
      "equipment.kettle_transfer_loss_l",
      "equipment.trub_loss_l",
    ],
  },
  {
    title: "HLT",
    fields: [
      "equipment.max_hlt_volume_l",
      "equipment.hlt_dead_space_l",
      "equipment.hlt_transfer_loss_l",
      "equipment.hlt_coil_floor_l",
    ],
  },
  {
    title: "Brewhouse",
    fields: [
      "equipment.nominal_boil_off_rate_l_per_hr",
      "equipment.shrinkage_pct",
      "equipment.nominal_conversion_efficiency",
      "equipment.grain_absorption_factor_l_per_kg",
    ],
  },
];

export const equipmentFields = equipmentSections.flatMap((section) => section.fields);

// A step's resolved display groups. Steps that declare `sections` render one
// block per section with a heading; everything else stays a single flat list, so
// `display: contents` keeps its DOM layout identical to the ungrouped card.
export function stepFieldGroups(step, fields = []) {
  if (!step?.sections?.length) {
    return [{ id: step?.slice ?? "", title: null, grid: false, fields }];
  }
  const byId = new Map(fields.map((field) => [field.id, field]));
  return step.sections.map((section) => ({
    id: `${step.slice}-${section.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    title: section.title,
    grid: true,
    fields: section.fields.map((id) => byId.get(id)).filter(Boolean),
  }));
}
