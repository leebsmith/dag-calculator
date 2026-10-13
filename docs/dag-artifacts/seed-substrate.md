# Seed Substrate

The **seed substrate** is the immutable reference data the engine resolves
against. It is *data*, not logic — the artifact **schematizes** it and
**references it by id**, but does not contain it.

---

## 1. The facts-vs-rules split

| Class | Examples | Editable? | Lives |
|---|---|---|---|
| **Immutable seeds** | malt/sugar/yeast catalogs, water lab reports, equipment presets | no | seed JSON (a separate data substrate) |
| **User-owned components** | custom equipment/water/grain-bill/mash-schedule records | yes (simple CRUD) | per-user persistence |
| **Ephemeral batch input** | manual water entry, batch-scoped overrides | yes (batch-scoped) | the batch draft |

The key line: **catalogs and reports are facts; they are never edited.** The
artifact's `primitive_schemas` define *what a malt / yeast / water report / …
is*; the seed JSON holds the *instances*.

Physical constants (sucrose yield, salt stoichiometry, acid properties) live in
the artifact's `constants`/`functions`, **not** in seed JSON — seed data is
reserved for profile-specific presets.

---

## 2. Primitive schemas

`primitive_schemas` declare the shape of each seed/component type. Each field
carries a `dimension`, an optional `domain`, an optional `default`, and an
`overridable` flag (governing the selection `overlay`).

### 2.1 `malt`

| Field | Dimension | Domain | Notes |
|---|---|---|---|
| `id`, `name` | — | — | identity/metadata (never overridable) |
| `category` | taxonomy `malt_category` | — | `BASE`/`CRYSTAL`/`ROASTED`/`ACID` |
| `yield_fraction` | percentage | `[0, 1]` | dry-basis extract yield |
| `color_lovibond` | grain_color | `gte 0` | dry-malt color |
| `moisture_pct` | percentage | `[0, 1]`, default 0.04 | as-is moisture |
| `di_ph`, `buffer_index` | ph / dimensionless | optional | pH-model coefficients (Troester/Palmer per category) |

### 2.2 `sugar`

| Field | Dimension | Domain |
|---|---|---|
| `id`, `name` | — | — |
| `yield_fraction` | percentage | `[0, 1]` |
| `color_lovibond` | grain_color | `gte 0` |

### 2.3 `yeast`

| Field | Dimension | Domain |
|---|---|---|
| `id`, `name`, `manufacturer` | — | — |
| `attenuation_pct` | percentage | `[0, 1]` |
| `low_attenuation`, `high_attenuation` | percentage | the **override envelope** (domain bounds a selection can cite) |
| `flocculation`, `alcohol_tolerance_abv` | taxonomy / percentage | — |

### 2.4 `equipment`

The hardware/loss constants: `max_kettle_volume_l`, `max_mash_tun_volume_l`,
`max_hlt_volume_l`, `hlt_coil_floor_l`, `mash_dead_space_l`,
`mash_transfer_loss_l`, `kettle_dead_space_l`, `kettle_transfer_loss_l`,
`hlt_dead_space_l`, `hlt_transfer_loss_l`, `trub_loss_l` (all `volume`),
`boil_off_rate_l_per_hr` (`volume/time`), `grain_absorption_factor_l_per_kg`
(`volume/mass`), `conversion_efficiency` and `shrinkage_pct` (`percentage`),
`mash_tun_specific_heat` (`specific_heat`), `mash_tun_mass_kg` (`mass`).
`hlt_starting_volume_l` is **batch-level**, not an equipment field.

### 2.5 `water_report` / `water_target`

- `water_report` — `{ report_id, date_reported, calcium_ca, magnesium_mg,
  sodium_na, sulfate_so4, chloride_cl, total_alkalinity_caco3,
  bicarbonate_hco3, ph }` (ions in ppm).
- `water_target` — `{ id, ions (six working ions), sulfate_chloride_ratio,
  calcium_floor_ppm }` (presets like RO/Distilled, Balanced Pale, Hoppy/IPA…).

---

## 3. How the engine consumes seeds

- **Container shape:** every catalog seed is a flat **id-keyed map**
  (`{ "<id>": { ...component... } }`), where each component conforms to its
  `primitive_schema`. The exception is `mash-schedules.json`, a
  `{ schedule_id → rests[] }` template whose `rests` are ordered. (`water_report`
  is keyed by `report_id`; `water_target` ions are flat, not nested under `ions`.)
- Selections resolve a `ref` (id) against the seed/component store into a typed
  value (per the schema); the `overlay` applies on top.
- The six working ions for a water source are **derived from the lab report**
  (`source` is never entered independently in report mode): alkalinity is
  `total_alkalinity_caco3`, falling back to `bicarbonate_hco3 × (50/61)`.
- Dotted sub-refs (`equipment.mash_tun_specific_heat`, `grist.major_malts`)
  resolve through the schema.

---

## 4. Provenance

The freeze records, per embedded component: `source_template_id` +
`source_revision` (content hash) + `schema_version`. If a seed changes under a
frozen batch, the revision mismatch is detected and the user reconciles
(reset-to-seed / keep-custom) — drift is explicit, never silent.
