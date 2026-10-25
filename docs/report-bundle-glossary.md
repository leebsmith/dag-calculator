# Report bundle glossary

Generated from `data/artifact.json` and the presentation registries — do not
edit by hand. Regenerate after any artifact, registry, or step-label change:

```bash
node scripts/emit-report-bundle-glossary.mjs
```

Every path a bundle can expose is listed once. Read the value with the path
rule in [`report-bundle.md`](report-bundle.md) §3: node ids are keys in
`state.valuation`; a dotted suffix reads into a boundary output map, a
selection field, or a collection row. `identity` rows live under
`batch.identity`.

Numbers are **base-unit** values. Convert with `catalog.dimensions[dimension]`
and the `unit` id in this table, then round to `decimals` (see
[`report-bundle.md`](report-bundle.md) §4). `options` are taxonomy values from
`catalog.nodes[path].options`; display labels are in `option_labels`.

Kind legend: `root` / `choice` / `derived` / `selection` / `collection` /
`boundary` are nodes; `output` is a boundary output; `field` is a selection or
collection field; `identity` is a component field.

## Batch & grist inputs

_84 paths_

| Path | Label | Kind | Dimension | Unit | Decimals | Options |
|---|---|---|---|---|---|---|
| `batch.attenuation_derate_points` | Batch derate (points) | root | percentage | pct (%) | 1 | — |
| `batch.boil_hops` | Boil hops | collection | — | — | — | — |
| `batch.boil_hops.alpha_acid_pct` | Alpha | field | percentage | pct (%) | 1 | — |
| `batch.boil_hops.boil_time_fraction` | Boil remaining | field | percentage | pct (%) | 1 | — |
| `batch.boil_hops.hop_id` | Hop ID | field | — | — | — | — |
| `batch.boil_hops.name` | Hop | field | — | — | — | — |
| `batch.boil_hops.parts` | Parts | field | dimensionless | 1 | — | — |
| `batch.boil_hops.pct` | IBU share | field | percentage | pct (%) | 1 | — |
| `batch.boil_off_rate_l_per_hr` | Boil-off rate | root | volume_per_time | L_per_hr (L/hr) | 1 | — |
| `batch.boil_target_ibu` | Boil IBU | derived | ibu | IBU | 1 | — |
| `batch.boil_time_min` | Boil time | root | time | min | 0 | — |
| `batch.brew_day_steps` | Brew day steps | collection | — | — | — | — |
| `batch.brew_day_steps.enabled` | Include | field | — | — | — | — |
| `batch.brew_day_steps.instructions` | Instructions | field | — | — | — | — |
| `batch.brew_day_steps.name` | Name | field | — | — | — | — |
| `batch.brew_day_steps.section` | Section | field | — | — | — | — |
| `batch.brew_day_steps.step_id` | Step | field | — | — | — | — |
| `batch.conversion_efficiency` | Conversion efficiency | root | percentage | pct (%) | 1 | — |
| `batch.delta_v_evap` | − Boil-off | derived | volume | L | 1 | — |
| `batch.dry_hops` | Dry hops | collection | — | — | — | — |
| `batch.dry_hops.application_stage` | Stage | field | — | — | — | whirlpool, active_fermentation, cold_side |
| `batch.dry_hops.contact_duration_hours` | Contact duration | field | time | hr | 1 | — |
| `batch.dry_hops.notes` | Notes | field | — | — | — | — |
| `batch.dry_hops.product_type` | Type | field | — | — | — | raw_whole_cones, frozen_whole_cones, map_whole_cones, liquid_extract, cryo_powder, terpene_isolate |
| `batch.dry_hops.quantity` | Quantity | field | dimensionless | 1 | — | — |
| `batch.dry_hops.time_of_application` | When | field | — | — | — | — |
| `batch.dry_hops.unit` | Unit | field | — | — | — | oz, g, ml |
| `batch.dry_hops.variety` | Variety | field | — | — | — | — |
| `batch.fermentation` | Fermentation | choice | — | — | — | ale, lager, wild, mixed |
| `batch.grain_moisture_fraction` | Fallback grain moisture (when a malt has none) | root | percentage | pct (%) | 1 | — |
| `batch.hlt_starting_volume_l` | HLT starting volume | root | volume | L | 1 | — |
| `batch.mash_thickness_l_per_kg` | Liquor-to-Grist Ratio | root | mash_thickness | L_per_kg (L/kg) | 2 | — |
| `batch.realized_abv` | ABV | derived | abv | pct | 1 | — |
| `batch.realized_fg` | Final gravity | derived | gravity | Plato (°P) | 1 | — |
| `batch.runnings_ratio` | Runnings Ratio (r, V1/V2) | derived | dimensionless | 1 | — | — |
| `batch.runoff_ratio` | Runoff Ratio r | root | dimensionless | 1 | — | — |
| `batch.s_late_add` | Total extract | derived | mass | kg | 1 | — |
| `batch.shrinkage_volume_l` | − Shrinkage | derived | volume | L | 1 | — |
| `batch.sparge_salted_volume` | Sparge salt dosing volume | derived | volume | L | 1 | — |
| `batch.sugars` | Late additions | collection | — | — | — | — |
| `batch.sugars.color_lovibond` | Color | field | grain_color | EBC | 1 | — |
| `batch.sugars.fermentability_fraction` | Fermentable | field | percentage | pct (%) | 1 | — |
| `batch.sugars.mass_kg` | Mass | field | mass | kg | 1 | — |
| `batch.sugars.name` | Sugar | field | — | — | — | — |
| `batch.sugars.notes` | Notes | field | — | — | — | — |
| `batch.sugars.sugar_id` | Sugar ID | field | — | — | — | — |
| `batch.sugars.yield_fraction` | Yield | field | percentage | pct (%) | 1 | — |
| `batch.surplus_sparge_capacity` | surplus sparge capacity | derived | volume | L | 1 | — |
| `batch.target_abv` | Target ABV | root | abv | pct | 1 | — |
| `batch.target_ibu` | Target IBU | root | ibu | IBU | 1 | — |
| `batch.target_srm` | Target SRM | root | beer_color | EBC | 1 | — |
| `batch.topology` | Constraint Topology | choice | — | — | — | r_l_to_g, runoff_ratio |
| `batch.total_water_used` | Total Water Used | derived | volume | L | 1 | — |
| `batch.v_ferm` | Fermenter volume | root | volume | L | 1 | — |
| `batch.whirlpool_ambient_temp_c` | Whirlpool ambient | root | temperature | degC (°C) | 1 | — |
| `batch.whirlpool_cooling_time_constant_min` | Cooling time constant | root | time | min | 0 | — |
| `batch.whirlpool_hops` | Whirlpool hops | collection | — | — | — | — |
| `batch.whirlpool_hops.alpha_acid_pct` | Alpha | field | percentage | pct (%) | 1 | — |
| `batch.whirlpool_hops.duration_min` | Rest | field | time | min | 0 | — |
| `batch.whirlpool_hops.hop_id` | Hop ID | field | — | — | — | — |
| `batch.whirlpool_hops.initial_temp_c` | Initial temp | field | temperature | degC (°C) | 1 | — |
| `batch.whirlpool_hops.name` | Hop | field | — | — | — | — |
| `batch.whirlpool_hops.notes` | Notes | field | — | — | — | — |
| `batch.whirlpool_hops.parts` | Parts | field | dimensionless | 1 | — | — |
| `batch.whirlpool_hops.pct` | IBU share | field | percentage | pct (%) | 1 | — |
| `batch.whirlpool_hops.product_form` | Form | field | — | — | — | t90_pellet, flowable_extract |
| `batch.whirlpool_hops.t90_replacement_ratio` | T90 Replacement Ratio | field | dimensionless | 1 | — | — |
| `batch.whirlpool_ibu_fraction` | Whirlpool IBU share | root | percentage | pct (%) | 1 | — |
| `batch.whirlpool_target_ibu` | Whirlpool IBU | derived | ibu | IBU | 1 | — |
| `batch.yeast` | Yeast | selection | — | — | — | — |
| `batch.yeast.alcohol_tolerance` | Alcohol tolerance | field | — | — | — | — |
| `batch.yeast.attenuation_pct` | Typical attenuation | field | percentage | pct (%) | 1 | — |
| `batch.yeast.flocculation` | Flocculation | field | — | — | — | Low, Medium, High |
| `batch.yeast.form` | Form | field | — | — | — | Dry, Liquid |
| `batch.yeast.id` | ID | field | — | — | — | — |
| `batch.yeast.manufacturer` | Manufacturer | field | — | — | — | — |
| `batch.yeast.name` | Name | field | — | — | — | — |
| `batch.yeast.notes` | Notes | field | — | — | — | — |
| `batch.yeast.recipes` | Recipes | field | — | — | — | — |
| `batch.yeast.temp_high_c` | Temp High C | field | temperature | degC (°C) | 1 | — |
| `batch.yeast.temp_low_c` | Temp Low C | field | temperature | degC (°C) | 1 | — |
| `batch.yeast.url` | URL | field | — | — | — | — |
| `batch.yeast_cap` | Yeast attenuation cap | derived | percentage | pct (%) | 1 | — |
| `batch.yeast_id` | Yeast | root | reference | id | — | — |

## Grist

_28 paths_

| Path | Label | Kind | Dimension | Unit | Decimals | Options |
|---|---|---|---|---|---|---|
| `grist.finished_beer_srm` | Beer color | derived | beer_color | EBC | 1 | — |
| `grist.major_malts` | Grain bill | collection | — | — | — | — |
| `grist.major_malts.catalog_id` | Catalog ID | field | — | — | — | — |
| `grist.major_malts.category` | Type | field | — | — | — | BASE, CRYSTAL, ROASTED, ACID |
| `grist.major_malts.color_lovibond` | Color | field | grain_color | EBC | 1 | — |
| `grist.major_malts.fermentability_fraction` | Fermentable | field | percentage | pct (%) | 1 | — |
| `grist.major_malts.moisture_fraction` | Moisture Fraction | field | percentage | pct (%) | 1 | — |
| `grist.major_malts.name` | Malt | field | — | — | — | — |
| `grist.major_malts.notes` | Notes | field | — | — | — | — |
| `grist.major_malts.parts` | Parts | field | dimensionless | 1 | — | — |
| `grist.major_malts.pct` | Pct | field | percentage | pct (%) | 1 | — |
| `grist.major_malts.yield_fraction` | Yield | field | percentage | pct (%) | 1 | — |
| `grist.mcu` | Mcu | derived | dimensionless | 1 | — | — |
| `grist.sugar_weighted_lovibond` | Weighted sugar color | derived | grain_color | EBC | 1 | — |
| `grist.sugars_mass` | Total sugar mass | derived | mass | kg | 1 | — |
| `grist.trace_malts` | Trace malts | collection | — | — | — | — |
| `grist.trace_malts.catalog_id` | Catalog ID | field | — | — | — | — |
| `grist.trace_malts.category` | Type | field | — | — | — | BASE, CRYSTAL, ROASTED, ACID |
| `grist.trace_malts.color_lovibond` | Color | field | grain_color | EBC | 1 | — |
| `grist.trace_malts.fermentability_fraction` | Fermentable | field | percentage | pct (%) | 1 | — |
| `grist.trace_malts.mass_kg` | Mass | field | mass | oz | 2 | — |
| `grist.trace_malts.name` | Malt | field | — | — | — | — |
| `grist.trace_malts.notes` | Notes | field | — | — | — | — |
| `grist.trace_malts.yield_fraction` | Yield | field | percentage | pct (%) | 1 | — |
| `grist.trace_malts_mass` | Trace malt mass | derived | mass | oz | 2 | — |
| `grist.trace_weighted_lovibond` | Weighted trace color | derived | grain_color | EBC | 1 | — |
| `grist.weighted_lovibond` | Weighted grist color | derived | grain_color | EBC | 1 | — |
| `grist.weighted_yield_fraction` | Weighted extract yield | derived | percentage | pct (%) | 1 | — |

## Mash

_17 paths_

| Path | Label | Kind | Dimension | Unit | Decimals | Options |
|---|---|---|---|---|---|---|
| `mash.dough_in_target_temp_c` | Dough-in target | derived | temperature | degC (°C) | 1 | — |
| `mash.enabled_max_temp_c` | Enabled Max Temp C | derived | temperature | degC (°C) | 1 | — |
| `mash.enabled_min_temp_c` | Enabled Min Temp C | derived | temperature | degC (°C) | 1 | — |
| `mash.grain_temp_c` | Grain temperature | root | temperature | degC (°C) | 1 | — |
| `mash.heating_rate_c_per_min` | Heating Rate C Per Min | derived | temperature_delta_per_time | dC_per_min (°C/min) | 2 | — |
| `mash.preset_id` | Preset ID | choice | — | — | — | single_infusion, custom, belgian_saison, belgian_tripel, german_pils, berliner_weisse, english_brown, american_pale |
| `mash.ramp_time_min` | Ramp Time Min | derived | time | min | 0 | — |
| `mash.rests` | Rests | collection | — | — | — | — |
| `mash.rests.duration_min` | Duration Min | field | time | min | 0 | — |
| `mash.rests.enabled` | Enabled | field | — | — | — | — |
| `mash.rests.rest_id` | Rest ID | field | — | — | — | phytase, ferulic, beta_glucan, protein, beta_amylase, alpha_amylase, beta_alpha_amylase, mash_out |
| `mash.rests.use_temp_c` | Use Temp C | field | temperature | degC (°C) | 1 | — |
| `mash.strike_water_temp_base_c` | Strike base temp | derived | temperature | degC (°C) | 1 | — |
| `mash.strike_water_temp_c` | Strike water temp | derived | temperature | degC (°C) | 1 | — |
| `mash.strike_water_tun_offset_c` | Tun thermal offset | derived | temperature_delta | dC (Δ°C) | 1 | — |
| `mash.total_time_min` | Total mash time | derived | time | min | 0 | — |
| `mash.tun_initial_temp_c` | Tun initial temperature | root | temperature | degC (°C) | 1 | — |

## Water chemistry

_61 paths_

| Path | Label | Kind | Dimension | Unit | Decimals | Options |
|---|---|---|---|---|---|---|
| `water.acid_medium` | Acid medium | choice | — | — | — | LACTIC_88, PHOSPHORIC_10, PHOSPHORIC_85 |
| `water.cacl2_form` | CaCl2 form | choice | — | — | — | CACL2_DIHYDRATE, CACL2_ANHYDROUS |
| `water.calcium_floor_ppm` | Calcium floor | root | concentration | ppm | 1 | — |
| `water.gypsum_form` | Gypsum form | choice | — | — | — | GYPSUM_DIHYDRATE, GYPSUM_ANHYDROUS |
| `water.kettle_blend.alkalinity_as_caco3` | Alkalinity | derived | concentration | ppm | 1 | — |
| `water.kettle_blend.calcium_ca` | Calcium | derived | concentration | ppm | 1 | — |
| `water.kettle_blend.chloride_cl` | Chloride | derived | concentration | ppm | 1 | — |
| `water.kettle_blend.magnesium_mg` | Magnesium | derived | concentration | ppm | 1 | — |
| `water.kettle_blend.sodium_na` | Sodium | derived | concentration | ppm | 1 | — |
| `water.kettle_blend.sulfate_chloride_ratio` | Sulfate Chloride Ratio | derived | dimensionless | 1 | — | — |
| `water.kettle_blend.sulfate_so4` | Sulfate | derived | concentration | ppm | 1 | — |
| `water.pinned_ions` | Pinned Ions | collection | — | — | — | — |
| `water.pinned_ions.ion` | Ion | field | — | — | — | ca, mg, na, so4, cl, alk |
| `water.preferred_alkaline_agent` | Alkaline agent | choice | — | — | — | BAKING_SODA, CHALK, PICKLING_LIME |
| `water.salt_distribution` | Salt distribution | choice | — | — | — | MASH_ONLY, PROPORTIONAL |
| `water.source.bicarbonate_hco3` | Bicarbonate Hco3 | identity | concentration | ppm | 1 | — |
| `water.source.calcium_ca` | Calcium | identity | concentration | ppm | 1 | — |
| `water.source.chloride_cl` | Chloride | identity | concentration | ppm | 1 | — |
| `water.source.date_received` | Date Received | identity | — | — | — | — |
| `water.source.date_reported` | Date Reported | identity | — | — | — | — |
| `water.source.electrical_conductivity_mmho_cm` | Electrical Conductivity Mmho Cm | identity | dimensionless | 1 | — | — |
| `water.source.laboratory` | Laboratory | identity | — | — | — | — |
| `water.source.location` | Location | identity | — | — | — | — |
| `water.source.magnesium_mg` | Magnesium | identity | concentration | ppm | 1 | — |
| `water.source.nitrate_no3_n` | Nitrate No3 N | identity | concentration | ppm | 1 | — |
| `water.source.notes` | Notes | identity | — | — | — | — |
| `water.source.ph` | pH | identity | ph | pH | 2 | — |
| `water.source.potassium_k` | Potassium K | identity | concentration | ppm | 1 | — |
| `water.source.report_id` | Report ID | identity | — | — | — | — |
| `water.source.sample_id` | Sample ID | identity | — | — | — | — |
| `water.source.sodium_na` | Sodium | identity | concentration | ppm | 1 | — |
| `water.source.source_name` | Source Name | identity | — | — | — | — |
| `water.source.sulfate_so4` | Sulfate | identity | concentration | ppm | 1 | — |
| `water.source.tds_ppm` | TDS Ppm | identity | concentration | ppm | 1 | — |
| `water.source.total_alkalinity_caco3` | Alkalinity | identity | concentration | ppm | 1 | — |
| `water.source.total_hardness_caco3` | Total Hardness Caco3 | identity | concentration | ppm | 1 | — |
| `water.source.total_iron_fe` | Total Iron Fe | identity | concentration | ppm | 1 | — |
| `water.source.total_phosphorus_p` | Total Phosphorus P | identity | concentration | ppm | 1 | — |
| `water.strategy` | Strategy | choice | — | — | — | FLAVOR, CALCIUM_FLOOR, OPTIMIZE, AUTO, HYBRID, BASELINE, CUSTOM |
| `water.target.alkalinity_as_caco3` | Alkalinity | root | concentration | ppm | 1 | — |
| `water.target.calcium_ca` | Calcium | root | concentration | ppm | 1 | — |
| `water.target.chloride_cl` | Chloride | root | concentration | ppm | 1 | — |
| `water.target.magnesium_mg` | Magnesium | root | concentration | ppm | 1 | — |
| `water.target.sodium_na` | Sodium | root | concentration | ppm | 1 | — |
| `water.target.sulfate_chloride_ratio` | Sulfate Chloride Ratio | derived | dimensionless | 1 | — | — |
| `water.target.sulfate_so4` | Sulfate | root | concentration | ppm | 1 | — |
| `water.target_mash_ph` | Target mash pH | root | ph | pH | 2 | — |
| `water.target_profile` | Target Profile | selection | — | — | — | — |
| `water.target_profile.alkalinity_as_caco3` | Alkalinity (as CaCO3) | field | concentration | ppm | 1 | — |
| `water.target_profile.calcium_ca` | Calcium | field | concentration | ppm | 1 | — |
| `water.target_profile.calcium_floor_ppm` | Calcium floor | field | concentration | ppm | 1 | — |
| `water.target_profile.chloride_cl` | Chloride | field | concentration | ppm | 1 | — |
| `water.target_profile.description` | Description | field | — | — | — | — |
| `water.target_profile.id` | ID | field | — | — | — | — |
| `water.target_profile.magnesium_mg` | Magnesium | field | concentration | ppm | 1 | — |
| `water.target_profile.mode` | Mode | field | — | — | — | FLAVOR, CALCIUM_FLOOR, OPTIMIZE, AUTO, HYBRID, BASELINE, CUSTOM |
| `water.target_profile.name` | Name | field | — | — | — | — |
| `water.target_profile.notes` | Notes | field | — | — | — | — |
| `water.target_profile.sodium_na` | Sodium | field | concentration | ppm | 1 | — |
| `water.target_profile.sulfate_so4` | Sulfate | field | concentration | ppm | 1 | — |
| `water.target_profile_id` | Targets | root | reference | id | — | — |

## Solver — batch sparge

_24 paths_

| Path | Label | Kind | Dimension | Unit | Decimals | Options |
|---|---|---|---|---|---|---|
| `solver.batch` | Batch | boundary | — | — | — | — |
| `solver.batch.aa_batch` | Batch attenuation | output | percentage | pct (%) | 1 | — |
| `solver.batch.aa_wort` | Wort attenuation | output | percentage | pct (%) | 1 | — |
| `solver.batch.cascade.s_run1` | Extract | output | mass | kg | 1 | — |
| `solver.batch.cascade.s_run2` | Extract | output | mass | kg | 1 | — |
| `solver.batch.cascade.sg_pre_boil` | Gravity | output | gravity | Plato (°P) | 1 | — |
| `solver.batch.cascade.v_absorption` | − Grain absorption | output | volume | L | 1 | — |
| `solver.batch.cascade.v_mc` | Grain moisture (per malt, backfilled) | output | volume | L | 1 | — |
| `solver.batch.cascade.v_post_boil` | Post-boil (hot) | output | volume | L | 1 | — |
| `solver.batch.cascade.v_run1` | First runnings | output | volume | L | 1 | — |
| `solver.batch.cascade.v_run2` | Second runnings | output | volume | L | 1 | — |
| `solver.batch.cascade.v_sol` | Dissolved extract | output | volume | L | 1 | — |
| `solver.batch.cascade.v_sparge` | Sparge water | output | volume | L | 1 | — |
| `solver.batch.cascade.v_strike` | Strike water | output | volume | L | 1 | — |
| `solver.batch.hlt.v_hlt_after_strike` | V Hlt After Strike | output | volume | L | 1 | — |
| `solver.batch.hlt.v_hlt_debt` | V Hlt Debt | output | volume | L | 1 | — |
| `solver.batch.hlt.v_hlt_top_up` | HLT Top-Up | output | volume | L | 1 | — |
| `solver.batch.hlt.v_sparge_deliverable` | Sparge Deliverable | output | volume | L | 1 | — |
| `solver.batch.m_grist` | Grist Mass | output | mass | kg | 1 | — |
| `solver.batch.mash_thickness_l_per_kg` | Mash Thickness | output | mash_thickness | L_per_kg (L/kg) | 2 | — |
| `solver.batch.max_achievable_abv` | Max Achievable ABV | output | percentage | pct (%) | 1 | — |
| `solver.batch.s_post_boil_target` | Post-Boil Extract Target | output | mass | kg | 1 | — |
| `solver.batch.sg_post_boil` | Post-boil gravity | output | gravity | Plato (°P) | 1 | — |
| `solver.batch.v_pre_boil` | Pre-boil kettle | output | volume | L | 1 | — |

## Solver — water chemistry

_45 paths_

| Path | Label | Kind | Dimension | Unit | Decimals | Options |
|---|---|---|---|---|---|---|
| `solver.water` | Water | boundary | — | — | — | — |
| `solver.water.added_mineral_tds_ppm` | Added Mineral TDS Ppm | output | concentration | ppm | 1 | — |
| `solver.water.grist_buckets_kg.ACID` | ACID | output | mass | kg | 1 | — |
| `solver.water.grist_buckets_kg.BASE` | BASE | output | mass | kg | 1 | — |
| `solver.water.grist_buckets_kg.CRYSTAL` | CRYSTAL | output | mass | kg | 1 | — |
| `solver.water.grist_buckets_kg.ROASTED` | ROASTED | output | mass | kg | 1 | — |
| `solver.water.mash_additions.acid_l` | Mash acid | output | volume | ml (mL) | 1 | — |
| `solver.water.mash_additions.baking_soda_kg` | Mash baking soda | output | mass | g | 1 | — |
| `solver.water.mash_additions.cacl2_kg` | Mash calcium chloride | output | mass | g | 1 | — |
| `solver.water.mash_additions.chalk_kg` | Mash chalk | output | mass | g | 1 | — |
| `solver.water.mash_additions.epsom_kg` | Mash Epsom salt | output | mass | g | 1 | — |
| `solver.water.mash_additions.gypsum_kg` | Mash gypsum | output | mass | g | 1 | — |
| `solver.water.mash_additions.nacl_kg` | Mash table salt | output | mass | g | 1 | — |
| `solver.water.mash_additions.pickling_lime_kg` | Mash pickling lime | output | mass | g | 1 | — |
| `solver.water.post_dose_mash_ions.alkalinity_as_caco3` | Alkalinity | output | concentration | ppm | 1 | — |
| `solver.water.post_dose_mash_ions.calcium_ca` | Calcium | output | concentration | ppm | 1 | — |
| `solver.water.post_dose_mash_ions.chloride_cl` | Chloride | output | concentration | ppm | 1 | — |
| `solver.water.post_dose_mash_ions.magnesium_mg` | Magnesium | output | concentration | ppm | 1 | — |
| `solver.water.post_dose_mash_ions.sodium_na` | Sodium | output | concentration | ppm | 1 | — |
| `solver.water.post_dose_mash_ions.sulfate_so4` | Sulfate | output | concentration | ppm | 1 | — |
| `solver.water.post_salt_hlt_ions.alkalinity_as_caco3` | Alkalinity | output | concentration | ppm | 1 | — |
| `solver.water.post_salt_hlt_ions.calcium_ca` | Calcium | output | concentration | ppm | 1 | — |
| `solver.water.post_salt_hlt_ions.chloride_cl` | Chloride | output | concentration | ppm | 1 | — |
| `solver.water.post_salt_hlt_ions.magnesium_mg` | Magnesium | output | concentration | ppm | 1 | — |
| `solver.water.post_salt_hlt_ions.sodium_na` | Sodium | output | concentration | ppm | 1 | — |
| `solver.water.post_salt_hlt_ions.sulfate_so4` | Sulfate | output | concentration | ppm | 1 | — |
| `solver.water.post_salt_mash_ions.alkalinity_as_caco3` | Alkalinity | output | concentration | ppm | 1 | — |
| `solver.water.post_salt_mash_ions.calcium_ca` | Calcium | output | concentration | ppm | 1 | — |
| `solver.water.post_salt_mash_ions.chloride_cl` | Chloride | output | concentration | ppm | 1 | — |
| `solver.water.post_salt_mash_ions.magnesium_mg` | Magnesium | output | concentration | ppm | 1 | — |
| `solver.water.post_salt_mash_ions.sodium_na` | Sodium | output | concentration | ppm | 1 | — |
| `solver.water.post_salt_mash_ions.sulfate_so4` | Sulfate | output | concentration | ppm | 1 | — |
| `solver.water.prescription.mash_ph_status` | Mash pH status | output | — | — | — | OPTIMAL, LOW, HIGH |
| `solver.water.prescription.predicted_mash_ph` | Predicted mash pH | output | ph | pH | 2 | — |
| `solver.water.prescription.residual_hlt_water_l` | Residual HLT water | output | volume | L | 1 | — |
| `solver.water.sparge_additions.acid_l` | Sparge acid | output | volume | ml (mL) | 1 | — |
| `solver.water.sparge_additions.baking_soda_kg` | Sparge baking soda | output | mass | g | 1 | — |
| `solver.water.sparge_additions.cacl2_kg` | Sparge calcium chloride | output | mass | g | 1 | — |
| `solver.water.sparge_additions.chalk_kg` | Sparge chalk | output | mass | g | 1 | — |
| `solver.water.sparge_additions.epsom_kg` | Sparge Epsom salt | output | mass | g | 1 | — |
| `solver.water.sparge_additions.gypsum_kg` | Sparge gypsum | output | mass | g | 1 | — |
| `solver.water.sparge_additions.nacl_kg` | Sparge table salt | output | mass | g | 1 | — |
| `solver.water.sparge_additions.pickling_lime_kg` | Sparge pickling lime | output | mass | g | 1 | — |
| `solver.water.strategy` | Strategy | output | — | — | — | FLAVOR, CALCIUM_FLOOR, OPTIMIZE, AUTO, HYBRID, BASELINE, CUSTOM |
| `solver.water.total_added_salt_mass_g` | Total Added Salt Mass G | output | mass | kg | 1 | — |

## Solver — hop bitterness

_6 paths_

| Path | Label | Kind | Dimension | Unit | Decimals | Options |
|---|---|---|---|---|---|---|
| `solver.hops` | Hops | boundary | — | — | — | — |
| `solver.hops.boil_mass_kg` | Boil Mass Kg | output | mass | kg | 1 | — |
| `solver.hops.boil_rows` | Boil Rows | output | — | — | — | — |
| `solver.hops.total_mass_kg` | Total Mass Kg | output | mass | kg | 1 | — |
| `solver.hops.whirlpool_mass_kg` | Whirlpool Mass Kg | output | mass | kg | 1 | — |
| `solver.hops.whirlpool_rows` | Whirlpool Rows | output | — | — | — | — |

## Identity — equipment

_22 paths_

| Path | Label | Kind | Dimension | Unit | Decimals | Options |
|---|---|---|---|---|---|---|
| `equipment.description` | Description | identity | — | — | — | — |
| `equipment.grain_absorption_factor_l_per_kg` | Grain Absorption Factor L Per Kg | identity | mash_thickness | L_per_kg (L/kg) | 2 | — |
| `equipment.hlt_coil_floor_l` | Hlt Coil Floor L | identity | volume | L | 1 | — |
| `equipment.hlt_dead_space_l` | Hlt Dead Space L | identity | volume | L | 1 | — |
| `equipment.hlt_transfer_loss_l` | Hlt Transfer Loss L | identity | volume | L | 1 | — |
| `equipment.id` | ID | identity | — | — | — | — |
| `equipment.kettle_dead_space_l` | − Kettle dead space | identity | volume | L | 1 | — |
| `equipment.kettle_transfer_loss_l` | − Kettle transfer | identity | volume | L | 1 | — |
| `equipment.mash_dead_space_l` | − Mash dead space | identity | volume | L | 1 | — |
| `equipment.mash_heating_rate_c_per_min` | Mash ramp rate | identity | temperature_delta_per_time | dC_per_min (°C/min) | 2 | — |
| `equipment.mash_transfer_loss_l` | − Mash transfer loss | identity | volume | L | 1 | — |
| `equipment.mash_tun_mass_kg` | Mash tun mass | identity | mass | kg | 1 | — |
| `equipment.mash_tun_specific_heat` | Mash tun specific heat | identity | specific_heat | kcal_per_kg_degC (kcal/(kg·°C)) | 2 | — |
| `equipment.max_hlt_volume_l` | Max HLT volume | identity | volume | L | 1 | — |
| `equipment.max_kettle_volume_l` | Max Kettle Volume L | identity | volume | L | 1 | — |
| `equipment.max_mash_tun_volume_l` | Max Mash Tun Volume L | identity | volume | L | 1 | — |
| `equipment.min_lgr_l_per_kg` | Minimum LGR | identity | mash_thickness | qt_per_lb (qt/lb) | 2 | — |
| `equipment.name` | Name | identity | — | — | — | — |
| `equipment.nominal_boil_off_rate_l_per_hr` | Nominal boil-off rate | identity | volume_per_time | L_per_hr (L/hr) | 1 | — |
| `equipment.nominal_conversion_efficiency` | Nominal conversion efficiency | identity | percentage | pct (%) | 1 | — |
| `equipment.shrinkage_pct` | Shrinkage | identity | percentage | pct (%) | 1 | — |
| `equipment.trub_loss_l` | − Trub | identity | volume | L | 1 | — |

## Identity — style

_29 paths_

| Path | Label | Kind | Dimension | Unit | Decimals | Options |
|---|---|---|---|---|---|---|
| `style.abv_max` | ABV max | identity | abv | pct | 1 | — |
| `style.abv_min` | ABV min | identity | abv | pct | 1 | — |
| `style.appearance` | Appearance | identity | — | — | — | — |
| `style.aroma` | Aroma | identity | — | — | — | — |
| `style.category_id` | Category ID | identity | — | — | — | — |
| `style.category_name` | Category Name | identity | — | — | — | — |
| `style.characteristic_ingredients` | Characteristic Ingredients | identity | — | — | — | — |
| `style.comments` | Comments | identity | — | — | — | — |
| `style.commercial_examples` | Commercial Examples | identity | — | — | — | — |
| `style.entry_instructions` | Entry Instructions | identity | — | — | — | — |
| `style.fg_max` | FG max | identity | gravity | SG | 3 | — |
| `style.fg_min` | FG min | identity | gravity | SG | 3 | — |
| `style.flavor` | Flavor | identity | — | — | — | — |
| `style.forked_from_id` | Forked From ID | identity | — | — | — | — |
| `style.forked_from_name` | Forked From Name | identity | — | — | — | — |
| `style.history` | History | identity | — | — | — | — |
| `style.ibu_max` | IBU max | identity | ibu | IBU | 1 | — |
| `style.ibu_min` | IBU min | identity | ibu | IBU | 1 | — |
| `style.id` | ID | identity | — | — | — | — |
| `style.mouthfeel` | Mouthfeel | identity | — | — | — | — |
| `style.name` | Name | identity | — | — | — | — |
| `style.og_max` | OG max | identity | gravity | SG | 3 | — |
| `style.og_min` | OG min | identity | gravity | SG | 3 | — |
| `style.overall_impression` | Overall Impression | identity | — | — | — | — |
| `style.srm_max` | SRM max | identity | beer_color | SRM | 1 | — |
| `style.srm_min` | SRM min | identity | beer_color | SRM | 1 | — |
| `style.style_comparison` | Style Comparison | identity | — | — | — | — |
| `style.tags` | Tags | identity | — | — | — | — |
| `style.type` | Type | identity | — | — | — | beer, mead, cider |
