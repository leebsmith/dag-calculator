# Provenance — Discovery Sweep

Every artifact element mapped to its authoritative source, or `inferred` where no single
source states it. Authority order (§4): known-good code > `boundary.py` > domain docs >
seeds > legacy partials/stores > grammar docs.

## Dimensions

| id | source |
|---|---|
| `temperature`, `temperature_delta`, `volume`, `mass`, `gravity`, `color`, `specific_heat`, `mash_thickness`, `ph`, `concentration`, `percentage`, `reference`, `dimensionless` | exemplar `artifact.json` + `dimensions.md` |
| `time` (min) | `dimensions.md` §2 (base dimension) |
| `extract_yield` (L·°/kg; gal·°/lb=8.3454) | `dimensions.md` §4 + `constants.js` `SUCROSE_YIELD_LDK`/`LDK_PPG_CONVERSION_FACTOR` |
| `total_extract` (L·°; gal·pts=3.785411784) | `dimensions.md` §4 |
| `volume.units.ml` (0.001) | inferred (mass/volume SI sub-multiples; `_g`/`acid_ml` boundary outputs) |

## Constants

| id | source |
|---|---|
| `mash_thermal_factor` (0.41) | `mashSchedule.js` `C_GRAIN_KCAL_PER_KG_C` + `domain-equations.md` §1.1 |
| `water_specific_heat` (1.0) | exemplar + `domain-equations.md` §1.1 |
| `default_grain_temp_c` (20.0) | `constants.js` `DEFAULT_GRAIN_TEMP_C` |
| `default_equipment_profile_id` (`herms-30l`) | exemplar + `constants.js` |
| `default_target_abv` (5.5), `default_v_ferm_l` (20.0) | exemplar + `constants.js` |
| `default_apparent_attenuation` (0.75) | `batchSolverCard.js` fallback |
| `default_boil_time_min` (60) | `constants.js` `DEFAULT_BOIL_TIME_MIN` |
| `default_mash_thickness_l_per_kg` (2.6079) | `batchSolverCard.js` (1.25 qt/lb) |
| `default_runoff_ratio` (1.0) | `batchSolverCard.js` `onTopologyChange` |
| `sucrose_yield_ldk` (385.641), `sucrose_yield_ppg` (46.21) | `constants.js` + `batch_solver.py` `GAMMA_METRIC` + `domain-equations.md` §1.2 |
| `v_bar` (0.625), `k_abs_true` (1.67), `rho_water` (1.00) | `batch_solver.py` `V_BAR_METRIC`/`K_ABS_TRUE_METRIC`/`RHO_WATER_METRIC` |
| `default_shrinkage_fraction` (0.04) | `batch_solver.py` `F_SHRINK_DEFAULT` + `templates.py` |
| `default_conversion_efficiency` (0.90) | `templates.py` `DEFAULT_CONVERSION_EFFICIENCY` |
| `default_grain_absorption_l_per_kg` (0.96) | `templates.py` `DEFAULT_GRAIN_ABSORPTION_L_PER_KG` |
| `default_{mash_dead_space,mash_transfer_loss,kettle_dead_space,kettle_transfer_loss,hlt_dead_space,hlt_transfer_loss,trub_loss,hlt_coil_floor}_l` | `templates.py` `DEFAULT_*` |
| `default_mash_tun_specific_heat` (0.12), `default_mash_tun_mass_kg` (5.0) | `templates.py` `DEFAULT_MASH_TUN_*` |
| `default_boil_off_rate_l_per_hr` (3.0) | `constants.js` `DEFAULT_BOIL_OFF_RATE_L_PER_HR` |
| `default_target_mash_ph` (5.4) | `waterChemistry.js` `DEFAULT_TARGET_MASH_PH` |
| `default_calcium_floor_ppm` (50.0) | `water.py` `DEFAULT_CALCIUM_FLOOR_PPM` |
| `bicarbonate_eq_weight` (61.0), `caco3_eq_weight` (50.0) | `waterChemistry.js` `bicarbonateFromAlkalinity` + `logic.py` fallback |
| `mash_ph_optimal_low` (5.2), `mash_ph_optimal_high` (5.6) | `water.py` `MASH_PH_OPTIMAL_LOW/HIGH` |
| `mcu_metric_to_imperial_factor` (4.236) | `srm-ebc-and-lovibond-reference.md` (metric MCU→SRM scale) |
| `loa_baseline_temp_f` (152), `loa_baseline_attenuation_pct` (75), `loa_temp_coefficient` (1.2) | `mashSchedule.js` `LOA_*` |

## Taxonomies

| id | source |
|---|---|
| `malt_category` | exemplar + `primitives.py` `MaltCategory` + `constants.js` |
| `ph_status` | exemplar + `boundary.py` `MashPhStatus` |
| `topology` | `batch_solver.py` (`"r_l_to_g"|"runoff_ratio"`) + `BatchSpargeTopology` |
| `strategy` | `boundary.py` `WaterStrategy` |
| `salt_distribution` | `boundary.py` `SaltDistribution` |
| `acid_medium` | `boundary.py` `AcidMedium` |
| `alkaline_agent` | `boundary.py` `PreferredAlkalineAgent` |
| `gypsum_form`, `cacl2_form` | `water.py` `SALT_COEFFS` keys + legacy `SaltForm` enum |
| `flocculation` | `data/seeds/yeasts.json` distinct values (`Low`/`Medium`/`High`) |
| `mash_rest` | `mashSchedule.js` `CANONICAL_RESTS` + `DOUGH_IN_REST` + `MASH_OUT_REST` |

## Functions

| id | source |
|---|---|
| `calculate_strike_water_base_temp` | exemplar + `mashSchedule.js` `calculateStrikeWaterTempC` |
| `calculate_tun_thermal_offset` | exemplar + `mashSchedule.js` `calculateTunThermalOffsetC` |
| `sg_to_plato` | `utils.py::sg_to_plato` (ASBC cubic) |
| `plato_to_sg` | `utils.py::plato_to_sg` (ASBC 3rd-order) |
| `extract_yield_ldk` | `pureFunctions.js::calculateMetricLiterDegreesPerKg` + `domain-equations.md` §1.2 |
| `bicarbonate_from_alkalinity` | `waterChemistry.js::bicarbonateFromAlkalinity` |
| `alkalinity_from_bicarbonate` | `waterChemistry.js::ionsFromReport` fallback (50/61) |
| `sugar_gravity_points` | `pureFunctions.js::sugarGravityPoints` + `domain-equations.md` §1.4 |
| `morey_lovibond_to_srm` | exemplar + `srm-ebc-and-lovibond-reference.md` |
| `morey_mcu_to_srm` | `srm-ebc-and-lovibond-reference.md` (1.4922·MCU^0.6859) |
| `mash_ph_status` | exemplar + `water.py::mash_ph_status` |
| `estimate_single_rest_loa_pct` | `mashSchedule.js::estimateSingleRestLoaPct` |

## Primitive schemas

| id | source |
|---|---|
| `malt` | exemplar + `primitives.py::MaltPrimitive` + `data/seeds/malts.json` (adds `di_ph`/`buffer_index`/`notes`) |
| `sugar` | `primitives.py::SugarPrimitive` + `data/seeds/sugars.json` |
| `yeast` | `primitives.py::YeastPrimitive` + `data/seeds/yeasts.json` |
| `equipment` | `templates.py::EquipmentProfile` + `data/seeds/equipment_profiles.json` |
| `grist_row` | exemplar + `maltGridStore.js` row shape |
| `sugar_row` | `lateAdditionsStore.js` row shape (`mass_kg` added over `sugar`) |
| `mash_rest` | `mashSchedule.js::createDefaultMashSchedule` rest shape |
| `water_grist_row` | `boundary.py::WaterGristRow` |
| `water_report` | legacy `water.py::WaterReport` + `data/seeds/water_reports.json` (21 fields) |
| `water_target` | legacy `water.py::WaterTargetProfile` + `data/seeds/water_target_profiles.json` (nested `ions` flattened) |

## Nodes (by slice)

| node | source |
|---|---|
| `batch.equipment_profile_id`, `batch.target_abv`, `batch.v_ferm`, `batch.hlt_starting_volume_l` | exemplar + `wizard.js` manifest |
| `batch.boil_time_min` | `wizard.js` manifest `boil_time_min` |
| `batch.topology` | `batchSolverCard.js` `batchSolverTopology` |
| `batch.intensive_value` | `batchSolverCard.js` `batchSolverIntensiveValue` |
| `batch.yeast_id`, `batch.apparent_attenuation` | `yeastCard.js` + `wizard.js` manifest `yeast_id`/`yeast_attenuation_pct` |
| `batch.sugars` | `lateAdditionsStore.js` `additions` |
| `batch.yeast` | `yeastCard.js` selection (schema `yeast`) |
| `equipment.profile` | exemplar + `equipmentManager.js` selection |
| `water.source_report_id`, `water.source_report` | `waterCard.js`/`waterChemistry.js` `source_id`+`source_report_id` |
| `water.target_profile_id`, `water.target_profile` | `waterChemistry.js` `target_profile_id` |
| `water.source.*` (6), `water.target.*` (6) | `waterChemistry.js` `source`/`target` six working ions |
| `water.target_mash_ph`, `water.strategy`, `water.salt_distribution`, `water.acid_medium`, `water.gypsum_form`, `water.cacl2_form`, `water.preferred_alkaline_agent`, `water.calcium_floor_ppm` | `waterChemistry.js::createDefaultWaterState` + `boundary.py` |
| `water.v_hlt_treat_l` | `waterChemistry.js` (override; pre-filled from HLT budget) |
| `grist.major_malts` | exemplar + `maltGridStore.js::majorMalts` |
| `mash.grain_temp_c`, `mash.tun_initial_temp_c` | exemplar + `mashSchedule.js` |
| `mash.rests` | `mashSchedule.js::createDefaultMashSchedule` |
| `solver.batch` | exemplar + `boundary.py::BatchSolverRequest/Response` + `batch_solver.py` |
| `solver.water` | exemplar + `boundary.py::WaterSolverRequest/Response` + `water.py` |
| `mash.dough_in_target_temp_c` | `mashCard.js::doughInInheritedTempC` (derived; see gap C8/C9) |
| `mash.strike_water_temp_base_c`, `mash.strike_water_tun_offset_c`, `mash.strike_water_temp_c` | exemplar + `mashCard.js` strike-water chain |
| `grist.weighted_lovibond` | exemplar + `maltGridStore.js::weightedLovibond` |
| `grist.weighted_yield_fraction`, `grist.extract_yield_ldk` | `maltGridStore.js::weightedYield` (+ `pureFunctions.js`) |
| `grist.beer_srm` | exemplar (Lovibond↔SRM bridge) |
| `grist.mcu`, `grist.finished_beer_srm` | `srm-ebc-and-lovibond-reference.md` (MCU→Morey finished-beer color) |
| `batch.s_late_add` | `lateAdditionsStore.js::totalExtractMassKg` + `domain-equations.md` §1.4 |
| `batch.delta_v_evap` | `batchSolverCard.js` (`boil_off_rate × boil_time/60`) |
| `water.v_mash_treat_l`, `water.v_sparge_demand_l`, `water.v_hlt_debt_l`, `water.mash_thickness_l_per_kg` | `waterChemistry.js::buildWaterRequest` (identity from batch solver outputs) |
| `water.mash_ph_status` | exemplar (`mash_ph_status` over `predicted_mash_ph`) |

## Relations

| id | source |
|---|---|
| `hlt_not_overfilled` | exemplar |
| `kettle_not_overfilled` | inferred (`max_kettle_volume_l` capacity vs `v_pre_boil`) |
| `mash_thickness_above_husk_floor` | `batch_solver.py` `MASH_TOO_THIN` gate (`R_L:G < K_ABS_TRUE`) |
| `target_abv_reachable` | `batch_solver.py` `max_achievable_abv` + `ABV_UNREACHABLE` |

## Grammar v2 additions (Step A)

| Element | Source |
|---|---|
| `choice` kind (7 categorical inputs: topology, strategy, salt_distribution, acid_medium, gypsum_form, cacl2_form, alkaline_agent) | `boundary.py` enums + legacy `constants.js`/stores; ratified in Step A |
| `min` + optional `where` (dough-in target) | legacy `mashSchedule.js::doughInInheritedTempC`; ratified in Step A |
| boundary outputs **FLAT + dotted** (nested `cascade`/`hlt`/`prescription`/…) | `boundary.py` nested response models; ratified in Step A |
| `mash_rest.enabled` → `{type:"boolean"}` | legacy rest `enabled` flag; ratified in Step A |
| default mash schedule (`mash.rests`) | reference-cache seed `data/seeds/mash-schedules.json` |
| `schema_version` 1 → 2 | `grammar.md` §6 (shape change) |
