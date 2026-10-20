# Artifact inventory

Generated from `data/artifact.json` — do not edit by hand. Re-sync after
any artifact change: `node scripts/emit-artifact-inventory.mjs`.

- `schema_version`: **4**

## Dimensions

| id | base_unit | kind | units |
|---|---|---|---|
| `abv` | `pct` | linear | — |
| `beer_color` | `SRM` | linear | `EBC` (factor 0.5076142131979695) |
| `concentration` | `ppm` | linear | — |
| `dimensionless` | `1` | identity | — |
| `extract_yield` | `L_deg_per_kg` | linear | `gal_deg_per_lb` (factor 8.3454) |
| `grain_color` | `Lovibond` | linear | `EBC` (factor 0.5076142131979695) |
| `gravity` | `SG` | nonlinear | `Plato` (fwd sg_to_plato, inv plato_to_sg) |
| `ibu` | `IBU` | linear | — |
| `mash_thickness` | `L_per_kg` | linear | `qt_per_lb` (factor 2.08635) |
| `mass` | `kg` | linear | `g` (factor 0.001), `lb` (factor 0.45359237), `oz` (factor 0.028349523125) |
| `percentage` | `fraction` | linear | `pct` (factor 0.01) |
| `ph` | `pH` | linear | — |
| `reference` | `id` | identity | — |
| `specific_heat` | `kcal_per_kg_degC` | linear | `btu_per_lb_degF` (factor 1) |
| `temperature` | `degC` | affine | `degF` (factor 1.8, offset 32) |
| `temperature_delta` | `dC` | linear | `dF` (factor 1.8) |
| `time` | `min` | linear | `day` (factor 1440), `hr` (factor 60) |
| `total_extract` | `L_deg` | linear | `gal_pts` (factor 3.785411784) |
| `volume` | `L` | linear | `gal` (factor 3.785411784), `ml` (factor 0.001), `qt` (factor 0.946352946) |
| `volume_per_time` | `L_per_hr` | linear | `gal_per_hr` (factor 3.785411784) |

## Taxonomies

| id | values |
|---|---|
| `acid_medium` | `LACTIC_88`, `PHOSPHORIC_10`, `PHOSPHORIC_85` |
| `alkaline_agent` | `BAKING_SODA`, `CHALK`, `PICKLING_LIME` |
| `cacl2_form` | `CACL2_DIHYDRATE`, `CACL2_ANHYDROUS` |
| `fermentation` | `ale`, `lager`, `wild`, `mixed` |
| `flocculation` | `Low`, `Medium`, `High` |
| `form` | `Dry`, `Liquid` |
| `gypsum_form` | `GYPSUM_DIHYDRATE`, `GYPSUM_ANHYDROUS` |
| `hop_unit` | `oz`, `g`, `ml` |
| `malt_category` | `BASE`, `CRYSTAL`, `ROASTED`, `ACID` |
| `mash_preset` | `single_infusion`, `custom`, `belgian_saison`, `belgian_tripel`, `german_pils`, `berliner_weisse`, `english_brown`, `american_pale` |
| `mash_rest` | `dough_in`, `phytase`, `ferulic`, `beta_glucan`, `protein`, `beta_amylase`, `alpha_amylase`, `beta_alpha_amylase`, `mash_out` |
| `ph_status` | `OPTIMAL`, `LOW`, `HIGH` |
| `salt_distribution` | `MASH_ONLY`, `PROPORTIONAL` |
| `strategy` | `FLAVOR`, `CALCIUM_FLOOR`, `OPTIMIZE` |
| `style_source` | `styleguide`, `experimental` |
| `style_type` | `beer`, `mead`, `cider` |
| `topology` | `r_l_to_g`, `runoff_ratio` |
| `wet_hop_application_stage` | `whirlpool`, `active_fermentation`, `cold_side` |
| `wet_hop_product_type` | `raw_whole_cones`, `frozen_whole_cones`, `map_whole_cones`, `liquid_extract`, `cryo_powder`, `terpene_isolate` |

## Primitive schemas

| id | fields |
|---|---|
| `boil_hop_row` | `alpha_acid_pct` (dimension percentage, domain {"gte":0,"lte":1}), `boil_time_fraction` (dimension percentage, domain {"gte":0,"lte":1}), `hop_id` (—), `name` (—), `parts` (dimension dimensionless, domain {"gte":0}), `pct` (dimension percentage, domain {"gte":0,"lte":1}) |
| `dry_hop_row` | `application_stage` (taxonomy wet_hop_application_stage), `contact_duration_hours` (dimension time), `notes` (—), `product_type` (taxonomy wet_hop_product_type), `quantity` (dimension dimensionless), `time_of_application` (—), `unit` (taxonomy hop_unit), `variety` (—) |
| `equipment` | `description` (—), `grain_absorption_factor_l_per_kg` (dimension mash_thickness, domain {"gt":0}), `hlt_coil_floor_l` (dimension volume, domain {"gte":0}), `hlt_dead_space_l` (dimension volume, domain {"gte":0}), `hlt_transfer_loss_l` (dimension volume, domain {"gte":0}), `id` (—), `kettle_dead_space_l` (dimension volume, domain {"gte":0}), `kettle_transfer_loss_l` (dimension volume, domain {"gte":0}), `mash_dead_space_l` (dimension volume, domain {"gte":0}), `mash_transfer_loss_l` (dimension volume, domain {"gte":0}), `mash_tun_mass_kg` (dimension mass, domain {"gt":0}), `mash_tun_specific_heat` (dimension specific_heat, domain {"gt":0}), `max_hlt_volume_l` (dimension volume, domain {"gt":0}), `max_kettle_volume_l` (dimension volume, domain {"gt":0}), `max_mash_tun_volume_l` (dimension volume, domain {"gt":0}), `name` (—), `nominal_boil_off_rate_l_per_hr` (dimension volume_per_time, domain {"gt":0}), `nominal_conversion_efficiency` (dimension percentage, domain {"gt":0,"lte":1}), `shrinkage_pct` (dimension percentage, domain {"gte":0,"lte":0.2}), `trub_loss_l` (dimension volume, domain {"gte":0}) |
| `grist_row` | `catalog_id` (—), `category` (taxonomy malt_category), `color_lovibond` (dimension grain_color, domain {"gte":0}), `moisture_fraction` (dimension percentage, domain {"gte":0,"lte":1}), `name` (—), `notes` (—), `parts` (dimension dimensionless), `pct` (dimension percentage, domain {"gte":0,"lte":1}), `yield_fraction` (dimension percentage, domain {"gte":0,"lte":1}) |
| `hop` | `alpha_acid_max_pct` (dimension percentage, domain {"gte":0,"lte":1}), `alpha_acid_min_pct` (dimension percentage, domain {"gte":0,"lte":1}), `alpha_acid_pct` (dimension percentage, domain {"gte":0,"lte":1}), `alpha_rating` (—), `beta_acid_pct` (dimension percentage, domain {"gte":0,"lte":1}), `category` (—), `flavor_profiles` (—), `id` (—), `name` (—), `notes` (—), `origin` (—), `pairings` (—), `purpose` (—), `recipes_count` (—), `synonym` (—), `url` (—) |
| `malt` | `category` (taxonomy malt_category), `color_lovibond` (dimension grain_color, domain {"gte":0}), `family` (—), `generic_description` (—), `id` (—), `maltster` (—), `moisture_fraction` (dimension percentage, domain {"gte":0,"lte":1}), `name` (—), `notes` (—), `standard_malt` (—), `standard_name` (—), `yield_fraction` (dimension percentage, domain {"gte":0,"lte":1}) |
| `mash_rest` | `duration_min` (dimension time), `enabled` (type boolean), `rest_id` (taxonomy mash_rest), `use_temp_c` (dimension temperature) |
| `style` | `abv_max` (dimension abv, domain {"gte":0}), `abv_min` (dimension abv, domain {"gte":0}), `appearance` (—), `aroma` (—), `category_id` (—), `category_name` (—), `characteristic_ingredients` (—), `comments` (—), `commercial_examples` (—), `entry_instructions` (—), `fg_max` (dimension gravity, domain {"gte":0}), `fg_min` (dimension gravity, domain {"gte":0}), `flavor` (—), `history` (—), `ibu_max` (dimension ibu, domain {"gte":0}), `ibu_min` (dimension ibu, domain {"gte":0}), `id` (—), `mouthfeel` (—), `name` (—), `og_max` (dimension gravity, domain {"gte":0}), `og_min` (dimension gravity, domain {"gte":0}), `overall_impression` (—), `srm_max` (dimension beer_color, domain {"gte":0}), `srm_min` (dimension beer_color, domain {"gte":0}), `style_comparison` (—), `tags` (—), `type` (taxonomy style_type) |
| `sugar` | `color_lovibond` (dimension grain_color, domain {"gte":0}), `id` (—), `maltster` (—), `name` (—), `notes` (—), `yield_fraction` (dimension percentage, domain {"gte":0,"lte":1}) |
| `sugar_row` | `color_lovibond` (dimension grain_color, domain {"gte":0}), `mass_kg` (dimension mass, domain {"gte":0}), `name` (—), `notes` (—), `sugar_id` (—), `yield_fraction` (dimension percentage, domain {"gte":0,"lte":1}) |
| `trace_malt_row` | `catalog_id` (—), `category` (taxonomy malt_category), `color_lovibond` (dimension grain_color, domain {"gte":0}), `mass_kg` (dimension mass, domain {"gte":0}), `name` (—), `notes` (—), `yield_fraction` (dimension percentage, domain {"gte":0,"lte":1}) |
| `water_grist_row` | `color_lovibond` (dimension grain_color, domain {"gte":0}), `grain_type` (taxonomy malt_category), `mass_kg` (dimension mass, domain {"gt":0}) |
| `water_report` | `bicarbonate_hco3` (dimension concentration, domain {"gte":0}), `calcium_ca` (dimension concentration, domain {"gte":0}), `chloride_cl` (dimension concentration, domain {"gte":0}), `date_received` (—), `date_reported` (—), `electrical_conductivity_mmho_cm` (dimension dimensionless, domain {"gte":0}), `laboratory` (—), `magnesium_mg` (dimension concentration, domain {"gte":0}), `nitrate_no3_n` (dimension concentration, domain {"gte":0}), `notes` (—), `ph` (dimension ph, domain {"gte":0,"lte":14}), `potassium_k` (dimension concentration, domain {"gte":0}), `report_id` (—), `sample_id` (—), `sodium_na` (dimension concentration, domain {"gte":0}), `sulfate_so4` (dimension concentration, domain {"gte":0}), `tds_ppm` (dimension concentration, domain {"gte":0}), `total_alkalinity_caco3` (dimension concentration, domain {"gte":0}), `total_hardness_caco3` (dimension concentration, domain {"gte":0}), `total_iron_fe` (dimension concentration, domain {"gte":0}), `total_phosphorus_p` (dimension concentration, domain {"gte":0}) |
| `water_target` | `alkalinity_as_caco3` (dimension concentration, domain {"gte":0}), `calcium_ca` (dimension concentration, domain {"gte":0}), `calcium_floor_ppm` (dimension concentration, domain {"gte":0}, default 50), `chloride_cl` (dimension concentration, domain {"gte":0}), `description` (—), `id` (—), `magnesium_mg` (dimension concentration, domain {"gte":0}), `name` (—), `notes` (—), `sodium_na` (dimension concentration, domain {"gte":0}), `sulfate_chloride_ratio` (dimension dimensionless, domain {"gte":0}), `sulfate_so4` (dimension concentration, domain {"gte":0}) |
| `yeast` | `alcohol_tolerance` (—), `attenuation_pct` (dimension percentage, domain {"gte":0,"lte":1}), `flocculation` (taxonomy flocculation), `form` (taxonomy form), `id` (—), `manufacturer` (—), `name` (—), `notes` (—), `recipes` (—), `temp_high_c` (dimension temperature), `temp_low_c` (dimension temperature), `url` (—) |

## Functions

| id | params | returns |
|---|---|---|
| `alkalinity_from_bicarbonate` | bicarbonate_hco3 | `concentration` |
| `bicarbonate_from_alkalinity` | alkalinity_caco3 | `concentration` |
| `calculate_strike_water_base_temp` | t_target, t_grain, thickness | `temperature` |
| `calculate_tun_thermal_offset` | t_target, tun_initial, specific_heat, tun_mass, water_mass | `temperature_delta` |
| `estimate_single_rest_loa_pct` | temp_c | `percentage` |
| `extract_yield_ldk` | yield_fraction | `extract_yield` |
| `mash_ph_status` | ph | `ph_status` |
| `morey_mcu_to_srm` | mcu | `beer_color` |
| `plato_to_sg` | plato | `gravity` |
| `sg_to_plato` | sg | `gravity` |
| `sugar_gravity_points` | mass_kg, yield_fraction, v_ferm_l | `gravity` |

## Constants

| id | value | dimension |
|---|---|---|
| `bicarbonate_eq_weight` | 61 | `dimensionless` |
| `caco3_eq_weight` | 50 | `dimensionless` |
| `default_apparent_attenuation` | 0.75 | `percentage` |
| `default_boil_off_rate_l_per_hr` | 3 | `volume_per_time` |
| `default_boil_time_min` | 60 | `time` |
| `default_calcium_floor_ppm` | 50 | `concentration` |
| `default_conversion_efficiency` | 0.9 | `percentage` |
| `default_equipment_profile_id` | "herms-30l" | `reference` |
| `default_grain_absorption_l_per_kg` | 0.96 | `mash_thickness` |
| `default_grain_moisture_fraction` | 0.04 | `percentage` |
| `default_grain_temp_c` | 20 | `temperature` |
| `default_hlt_coil_floor_l` | 0 | `volume` |
| `default_hlt_dead_space_l` | 0.946 | `volume` |
| `default_hlt_transfer_loss_l` | 0.946 | `volume` |
| `default_kettle_dead_space_l` | 1.249 | `volume` |
| `default_kettle_transfer_loss_l` | 0.946 | `volume` |
| `default_mash_dead_space_l` | 0.946 | `volume` |
| `default_mash_thickness_l_per_kg` | 2.6079 | `mash_thickness` |
| `default_mash_transfer_loss_l` | 0.946 | `volume` |
| `default_mash_tun_mass_kg` | 5 | `mass` |
| `default_mash_tun_specific_heat` | 0.12 | `specific_heat` |
| `default_runoff_ratio` | 1 | `dimensionless` |
| `default_shrinkage_fraction` | 0.04 | `percentage` |
| `default_target_abv` | 5.5 | `percentage` |
| `default_target_ibu` | 30 | `ibu` |
| `default_target_mash_ph` | 5.4 | `ph` |
| `default_target_srm` | 0 | `beer_color` |
| `default_trub_loss_l` | 1.5 | `volume` |
| `default_v_ferm_l` | 20 | `volume` |
| `k_abs_true` | 1.67 | `mash_thickness` |
| `loa_baseline_attenuation_pct` | 75 | `percentage` |
| `loa_baseline_temp_f` | 152 | `dimensionless` |
| `loa_temp_coefficient` | 1.2 | `dimensionless` |
| `mash_ph_optimal_high` | 5.6 | `ph` |
| `mash_ph_optimal_low` | 5.2 | `ph` |
| `mash_thermal_factor` | 0.41 | `dimensionless` |
| `mcu_metric_to_imperial_factor` | 4.236 | `dimensionless` |
| `rho_water` | 1 | `dimensionless` |
| `sucrose_yield_ldk` | 385.641 | `extract_yield` |
| `sucrose_yield_ppg` | 46.21 | `extract_yield` |
| `v_bar` | 0.625 | `mash_thickness` |
| `water_specific_heat` | 1 | `specific_heat` |

## Nodes

| id | kind |
|---|---|
| `batch.apparent_attenuation` | root |
| `batch.boil_hops` | collection |
| `batch.boil_off_rate_l_per_hr` | root |
| `batch.boil_target_ibu` | derived |
| `batch.boil_time_min` | root |
| `batch.conversion_efficiency` | root |
| `batch.delta_v_evap` | derived |
| `batch.dry_hops` | collection |
| `batch.equipment_profile_id` | root |
| `batch.fermentation` | choice |
| `batch.grain_moisture_fraction` | root |
| `batch.hlt_starting_volume_l` | root |
| `batch.intensive_value` | root |
| `batch.runnings_ratio` | derived |
| `batch.s_late_add` | derived |
| `batch.shrinkage_volume_l` | derived |
| `batch.sparge_salted_volume` | derived |
| `batch.style` | selection |
| `batch.style_abv_max` | root |
| `batch.style_abv_min` | root |
| `batch.style_fg_max` | root |
| `batch.style_fg_min` | root |
| `batch.style_ibu_max` | root |
| `batch.style_ibu_min` | root |
| `batch.style_id` | root |
| `batch.style_og_max` | root |
| `batch.style_og_min` | root |
| `batch.style_source` | choice |
| `batch.style_srm_max` | root |
| `batch.style_srm_min` | root |
| `batch.sugars` | collection |
| `batch.surplus_sparge_capacity` | derived |
| `batch.target_abv` | root |
| `batch.target_ibu` | root |
| `batch.target_srm` | root |
| `batch.topology` | choice |
| `batch.total_water_used` | derived |
| `batch.v_ferm` | root |
| `batch.whirlpool_ibu_fraction` | root |
| `batch.whirlpool_target_ibu` | derived |
| `batch.yeast` | selection |
| `batch.yeast_id` | root |
| `equipment.profile` | selection |
| `grist.extract_yield_ldk` | derived |
| `grist.finished_beer_srm` | derived |
| `grist.major_malts` | collection |
| `grist.mcu` | derived |
| `grist.sugar_weighted_lovibond` | derived |
| `grist.sugars_mass` | derived |
| `grist.trace_malts` | collection |
| `grist.trace_malts_mass` | derived |
| `grist.trace_weighted_lovibond` | derived |
| `grist.weighted_lovibond` | derived |
| `grist.weighted_yield_fraction` | derived |
| `mash.dough_in_target_temp_c` | derived |
| `mash.grain_temp_c` | root |
| `mash.preset_id` | choice |
| `mash.rests` | collection |
| `mash.strike_water_temp_base_c` | derived |
| `mash.strike_water_temp_c` | derived |
| `mash.strike_water_tun_offset_c` | derived |
| `mash.tun_initial_temp_c` | root |
| `solver.batch` | boundary |
| `solver.water` | boundary |
| `water.acid_medium` | choice |
| `water.cacl2_form` | choice |
| `water.calcium_floor_ppm` | root |
| `water.gypsum_form` | choice |
| `water.mash_ph_status` | derived |
| `water.mash_thickness_l_per_kg` | derived |
| `water.preferred_alkaline_agent` | choice |
| `water.salt_distribution` | choice |
| `water.source.alkalinity_as_caco3` | root |
| `water.source.calcium_ca` | root |
| `water.source.chloride_cl` | root |
| `water.source.magnesium_mg` | root |
| `water.source.sodium_na` | root |
| `water.source.sulfate_so4` | root |
| `water.source_report` | selection |
| `water.source_report_id` | root |
| `water.strategy` | choice |
| `water.target.alkalinity_as_caco3` | root |
| `water.target.calcium_ca` | root |
| `water.target.chloride_cl` | root |
| `water.target.magnesium_mg` | root |
| `water.target.sodium_na` | root |
| `water.target.sulfate_so4` | root |
| `water.target_mash_ph` | root |
| `water.target_profile` | selection |
| `water.target_profile_id` | root |
| `water.v_hlt_debt_l` | derived |
| `water.v_hlt_treat_l` | root |
| `water.v_mash_treat_l` | derived |
| `water.v_sparge_demand_l` | derived |

## Relations

| id |
|---|
| `hlt_above_coil_floor` |
| `hlt_not_overfilled` |
| `kettle_not_overfilled` |
| `mash_thickness_above_husk_floor` |
| `target_abv_reachable` |

