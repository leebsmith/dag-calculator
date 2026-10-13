# Coverage Matrix — Discovery Sweep

Every wizard step, partial, and master-store field mapped to the owning artifact element,
or `presentation/ephemeral (excluded)`. Domain-only: labels, control kinds, CSS, layout,
sentinels, rounding, unit selection, and ephemeral UI state are excluded
(`semantics.md` §2.3).

Key to ownership columns:
- **node/selection/schema** — the artifact element.
- **excluded** — presentation/ephemeral.
- **host-side** — a host/engine concern, not expressible in the artifact (documented).

---

## Step 1 — Equipment Profile (`step-equipment-profile.html`)

| Legacy field | Artifact element |
|---|---|
| `equipment_profile_id` (selector) | `batch.equipment_profile_id` root → `equipment.profile` selection |
| `manifest.equipment.max_kettle_volume_l` | `equipment` schema `max_kettle_volume_l` |
| `manifest.equipment.max_mash_tun_volume_l` | `equipment.max_mash_tun_volume_l` |
| `manifest.equipment.max_hlt_volume_l` | `equipment.max_hlt_volume_l` |
| `manifest.equipment.mash_dead_space_l` | `equipment.mash_dead_space_l` (→ `solver.batch` `v_dead`) |
| `manifest.equipment.mash_transfer_loss_l` | `equipment.mash_transfer_loss_l` |
| `manifest.equipment.kettle_dead_space_l` | `equipment.kettle_dead_space_l` (→ `solver.batch` `v_kettle_dead`) |
| `manifest.equipment.kettle_transfer_loss_l` | `equipment.kettle_transfer_loss_l` |
| `manifest.equipment.trub_loss_l` | `equipment.trub_loss_l` |
| `manifest.equipment.hlt_dead_space_l` | `equipment.hlt_dead_space_l` (→ `solver.batch`) |
| `manifest.equipment.hlt_transfer_loss_l` | `equipment.hlt_transfer_loss_l` (→ `solver.batch`) |
| `manifest.equipment.hlt_coil_floor_l` | `equipment.hlt_coil_floor_l` (→ `solver.batch`) |
| `manifest.equipment.boil_off_rate_l_per_hr` | `equipment.boil_off_rate_l_per_hr` (→ `batch.delta_v_evap`) |
| `manifest.equipment.grain_absorption_factor_l_per_kg` | `equipment.grain_absorption_factor_l_per_kg` |
| `manifest.equipment.conversion_efficiency` | `equipment.conversion_efficiency` (→ `solver.batch` `eta_conv`) |
| `manifest.equipment.shrinkage_pct` | `equipment.shrinkage_pct` (→ `solver.batch` `f_shrink`) |
| `manifest.equipment.mash_tun_specific_heat` | `equipment.mash_tun_specific_heat` (→ strike offset) |
| `manifest.equipment.mash_tun_mass_kg` | `equipment.mash_tun_mass_kg` (overridable; → strike offset) |
| unit badges / draw  / "Manage Profiles (CRUD)" | excluded (unit selection, CRUD UI) |

## Step 2 — Yeast Selection (`step-yeast-selection.html`)

| Legacy field | Artifact element |
|---|---|
| `manifest.yeast_id` | `batch.yeast_id` root → `batch.yeast` selection (schema `yeast`) |
| `manifest.yeast_attenuation_pct` | `batch.apparent_attenuation` root (→ `solver.batch`) |
| yeast `attenuation_pct` (copy-in default) | `yeast.attenuation_pct` (host-side copy-in, gap C12 analog) |
| yeast `low_attenuation` / `high_attenuation` | `yeast` schema (envelope; UI range-guard) |
| yeast `flocculation`, `alcohol_tolerance_abv`, `manufacturer`, `notes` | `yeast` schema |
| search query, manufacturer filter, visible-crop, "Clear" | excluded (search/filter/routing) |

## Step 3 — Fermentables (`step-fermentables.html` + `modal-grain-bill-editor.html`)

| Legacy field | Artifact element |
|---|---|
| `majorMalts[]` (catalog_id, name, category, yield, color, moisture, di_ph, buffer_index) | `grist.major_malts` collection (`grist_row` schema) |
| `parts` → `pct` (Hamilton allocator) | host-side formulation (gap C10); `grist_row.parts`/`pct` |
| weighted color (`weightedLovibond`) | `grist.weighted_lovibond` |
| weighted yield (`weightedYield`) | `grist.weighted_yield_fraction` + `grist.extract_yield_ldk` |
| `traceMalts[]` (2% trace floor) | excluded (presentation threshold; not consumed by solvers) |
| "is_custom" badge, modal/drawer/search/filter | excluded |

## Step 4 — Late Additions (`step-late-additions.html` + `modal-late-additions-editor.html`)

| Legacy field | Artifact element |
|---|---|
| `additions[]` (sugar_id, name, mass_kg, yield_fraction, color_lovibond) | `batch.sugars` collection (`sugar_row` schema) |
| `totalExtractMassKg` (= s_late_add) | `batch.s_late_add` derived (`sum mass_kg × yield_fraction`) |
| `gravityPointsFor(row, v_ferm)` | `sugar_gravity_points` function |
| `totalPoints` | host-side/display (sum of gravity points; presentation) |
| `% of Grist` / `% of Bill` columns | excluded (display; derivable from `m_grist` + `batch.sugars`) |
| mass/color display, column view toggle, picker | excluded |

## Step 5 — Batch Sparge Solver (`step-batch-solver.html`)

| Legacy field | Artifact element |
|---|---|
| `target_abv` | `batch.target_abv` |
| `v_ferm` | `batch.v_ferm` |
| `topology` | `batch.topology` (taxonomy `topology`) |
| `intensive_value` | `batch.intensive_value` |
| `hlt_starting_volume_l` | `batch.hlt_starting_volume_l` |
| `boil_time_min` | `batch.boil_time_min` (→ `batch.delta_v_evap`) |
| `apparent_attenuation` | `batch.apparent_attenuation` |
| `grain_bill` (`w_i`,`yield_i`,`mc_i`) | `grist.major_malts` → `solver.batch` `grain_bill` (schema adaptation: `pct/100`, `yield_fraction`, `moisture_pct`) |
| `s_late_add` | `batch.s_late_add` |
| `v_kettle_dead` | `equipment.kettle_dead_space_l` |
| `delta_v_evap` | `batch.delta_v_evap` (`boil_off_rate × boil_time/60`) |
| `v_dead` | `equipment.mash_dead_space_l` |
| `eta_conv` | `equipment.conversion_efficiency` |
| `f_shrink` | `equipment.shrinkage_pct` |
| HLT fields (`hlt_dead/transfer/coil_floor/max`) | `equipment.*` |
| solver outputs (sg_post_boil, v_pre_boil, …, cascade, hlt, max_achievable_abv, mash_thickness) | `solver.batch` outputs |
| `target_og`, `preboil_volume_l`, `preboil_gravity`, `postboil_gravity`, `v_post_boil`, `m_grist`, `mash_thickness_l_per_kg` (manifest denormalized cache) | excluded (denormalized; canonical = `solver.batch` outputs, `grist.*`) |
| runnings ratio `r = v_run1/v_run2` | derivable from `solver.batch.cascade.v_run1/v_run2` (display-only, excluded) |
| total water used, surplus sparge capacity, sparge-salted volume | derivable from `solver.batch` outputs (display-only, excluded) |
| error surface / status bar | `solver.batch.domain.codes` (presentation strings excluded) |

## Step 6 — Mash (`step-mash.html` + `mash-rests-modal.html`)

| Legacy field | Artifact element |
|---|---|
| `manifest.mash.rests[]` (rest_id, enabled, use_temp_c, duration_min) | `mash.rests` collection (`mash_rest` schema) |
| `preset_id` + preset matrix | host-side (rest vocabulary = taxonomy `mash_rest`; preset membership is UI) |
| `grain_temp_c` | `mash.grain_temp_c` |
| `tun_initial_temp_c` | `mash.tun_initial_temp_c` |
| dough-in target (`doughInInheritedTempC`) | `mash.dough_in_target_temp_c` (derived, `min` over rests) |
| strike base temp | `mash.strike_water_temp_base_c` |
| tun thermal offset | `mash.strike_water_tun_offset_c` |
| strike water temp | `mash.strike_water_temp_c` |
| total mash time | derivable (`sum duration_min` over rests; display-only, excluded) |
| limit of attenuation (per rest) | `estimate_single_rest_loa_pct` function |
| limit of attenuation (schedule) | host-side duration-weighted reduction (gap C11; informational) |
| rest recommended ranges (`temp_min_c/max_c`) | host-side (`mashSchedule.js` `CANONICAL_RESTS`; validation guidance) |

## Step 7 — Water Chemistry (`step-water-chemistry.html`)

| Legacy field | Artifact element |
|---|---|
| `source_mode` (`report`/`ro`/`manual`) | excluded (mode selector; RO≡zero ions, manual≡edit roots) |
| `source_id`, `source_report_id` | `water.source_report_id` root + `water.source_report` selection |
| `source` six ions | `water.source.calcium_ca` … `alkalinity_as_caco3` roots |
| `target_profile_id` | `water.target_profile_id` root + `water.target_profile` selection |
| `target` six ions | `water.target.calcium_ca` … `alkalinity_as_caco3` roots |
| `target_mash_ph` | `water.target_mash_ph` |
| `strategy`, `salt_distribution`, `acid_medium`, `gypsum_form`, `cacl2_form`, `preferred_alkaline_agent`, `calcium_floor_ppm` | `water.strategy` … `water.calcium_floor_ppm` roots |
| `v_hlt_treat_l` (override) | `water.v_hlt_treat_l` root |
| `v_mash_treat_l`, `v_sparge_demand_l`, `v_hlt_debt_l`, `mash_thickness_l_per_kg` | `water.v_*` derived (identity from `solver.batch`) |
| source bicarbonate (derived) | `bicarbonate_from_alkalinity` function (host-side report→ion derivation) |
| solver outputs (prescription, mash/sparge additions, post-salt ions, buckets, warnings/notes) | `solver.water` outputs (`warnings`/`notes` excluded — advisory text) |
| mash pH status badge | `water.mash_ph_status` derived (or `solver.water` `prescription.mash_ph_status`) |

## Master store (`wizard.js` manifest) — remaining fields

| Field | Artifact element |
|---|---|
| `name`, `water_profile_id`, `hop_schedule`, `fermentation_schedule` | excluded (batch identity / not-implemented placeholders) |
| `dry_hops` | `batch.dry_hops` collection (`dry_hop_row` schema; description-only, no computation) |
| `equipment` (full object) | `equipment.profile` selection (full-copy; see gap C16) |
| `target_og`, `preboil_*`, `postboil_*`, `m_grist`, `mash_thickness_l_per_kg` | excluded (denormalized solver cache) |
| `grain_bill`, `late_additions`, `mash`, `water`, `yeast_id`, `yeast_attenuation_pct` | mapped above |

## Stores / components / utils

| Store | Disposition |
|---|---|
| `unitsStore` (unit mode, toggles, overrides) | excluded (unit selection) |
| `catalogStore` (malts/sugars/yeasts) | reference cache (seeds; schemas `malt`/`sugar`/`yeast`) |
| `equipmentStore` (profiles CRUD) | reference cache (schema `equipment`) |
| `maltGridStore` | `grist.major_malts` + Hamilton (host-side) |
| `lateAdditionsStore` | `batch.sugars` + `batch.s_late_add` |
| `mashModalStore`, `uiStore`, `authStore` | excluded (modal/toast/session state) |
| `wizardNavigation` (step registry, high-water mark) | excluded (routing) |
| `equipmentManager` (profile copy-in) | host-side (selection overlay resolution) |
| `batchSolverCard`/`waterCard`/`yeastCard`/`mashCard` | mapped to nodes/roots/derived above |
| `pureFunctions.js` (yield/gravity/Hamilton) | functions `extract_yield_ldk`, `sugar_gravity_points`; Hamilton host-side |
| `mashSchedule.js` (rests, strike, LoA) | `mash.rests`, strike functions, `estimate_single_rest_loa_pct` |
| `waterChemistry.js` (ions, request build) | `water.*` roots/derived + `bicarbonate_from_alkalinity` |
| `validators.js`, `catalogFilters.js`, `compose.js` | excluded (validation/filter/composition glue) |

No unexplained blanks: every step and store field above resolves to an artifact element,
an explicit host-side concern, or a documented presentation/ephemeral exclusion.
