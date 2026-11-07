# Seed Substrate

The **seed substrate** is the immutable reference data the engine resolves
against. It is *data*, not logic — the artifact **schematizes** it and
**references it by id**, but does not contain it.

---

## 1. The facts-vs-rules split

| Class | Examples | Editable? | Lives |
|---|---|---|---|
| **Immutable seeds** | malt/sugar/yeast catalogs, water lab reports, equipment presets | no | seed JSON (a separate data substrate) |
| **Library records** | "my house malt", "my tap water", "my 3-vessel rig" | create/delete (immutable) | `users/{uid}/catalog_items` (Firestore) |
| **Ephemeral batch input** | manual water entry, batch roots | yes (batch-scoped) | the batch draft |

The key line: **catalogs and reports are facts; they are never edited.** The
artifact's `primitive_schemas` define *what a malt / yeast / water report / …
is*; the seed JSON holds the *instances*.

**Library records** are a third class between the two: full components
conforming to the same `primitive_schema`, owned by the user and persisted on the
server under `users/{uid}/catalog_items`. They are immutable — create, read,
delete; a correction is a new record. They are merged into the picker's reference
cache (`record > seed`) so they can be chosen exactly like a seed, but choosing
one **copies it into the batch** (§4). The kind registry shared by frontend and
backend is [`data/catalogs.json`](../../data/catalogs.json); `style`, `malt`,
`yeast`, `hop`, `hop_product`, `sugar`, `equipment`, `water_report`, and
`water_target` support records.

Records fall into two classes by role. **Identity sources** — `style`,
`equipment`, `water_report` — define a batch: one of each is snapshotted into its
identity at creation. They are equal co-requisites and are authored in the
Library's *Sources* section; a style is forked from an existing record before it
is edited, and every record is sealed on save. **Formulation records** — the
remaining kinds — are step-local, snapshotted into the batch's selections when
picked, and authored in *Ingredients*. A fork keeps display lineage in
`forked_from_id` / `forked_from_name`; that is a snapshot, never a live edge.

Physical constants (sucrose yield, salt stoichiometry, acid properties) live in
the artifact's `constants`/`functions`, **not** in seed JSON — seed data is
reserved for profile-specific presets.

---

## 2. Primitive schemas

`primitive_schemas` declare the shape of each seed/component type. Each field
carries a `dimension`, an optional `domain`, and an optional `default`.

### 2.1 `malt`

`malt` carries identity and metadata (`id`, `name`, `maltster`, `standard_malt`,
`standard_name`, `family`, `generic_description`), the `malt_category` taxonomy,
and four quantities: `yield_fraction` and `fermentability_fraction` (percentage,
`[0, 1]`; dry-basis fine-grind yield and Congress-Mash limit), optional as-is
`moisture_fraction`, and `color_lovibond` (grain_color, `gte 0`). The full field
spec — dimension, domain and default — is in `inventory.md`.

**Moisture is a per-malt seed field where published.** `moisture_fraction` comes
from the datasheet (`moisture %/100`); malts that publish none carry no field.
`batch.grain_moisture_fraction` (default 4%) is the **fallback** for such rows:
the request adapter sends `mc_i = row.moisture_fraction ?? batch.grain_moisture_fraction`
per row, and the boundary computes the weighted `MC_bar = Σ wᵢ·mcᵢ`.

Mash pH/acidity is **not** a seed field either. The water solver derives grain
acidity from `category` + `color_lovibond` (a category color-slope model in
`backend/app/core/water/chemistry.py`). There is no per-malt `di_ph`/`buffer_index` to
source or maintain.

### 2.2 `sugar`

`sugar` carries identity (`id`, `name`, `maltster`), `yield_fraction` and
`fermentability_fraction` (percentage, `[0, 1]`; `1.0` for sugars/extracts) and
`color_lovibond` (grain_color, `gte 0`). The full field spec is in
`inventory.md`.

The malt and sugar seeds are built by `scripts/build-fermentables-seed.mjs`
from the vendored `data/sources/malt-database-malts.json` scrape (deduped
one-per-name, `malt`+`adjunct` → malts, `sugar`+`syrup`+`extract` → sugars).
Rows whose `yield_basis` is `fermentability` are interpreted by product type:
extract/syrup/sugar rows are **restored** as as-is sugar-point yields with
`fermentability_fraction = 1.0`; the two Maltoferm black extracts and any
malt/adjunct row with a fermentability basis are excluded. The raw source keeps
the original value and basis label.
Malts take a scraped `fermentability_fraction` when present, otherwise a
category default: base `0.81`, crystal `0.50`, roasted `0.15`, acid `0.80`.
`fermentability_fraction` is carried on `malt`, `sugar`, `standard-malts`,
`grist_row`, `sugar_row`, and `trace_malt_row`.
Each malt is classified against `data/sources/standard-malts.json` via the
committed `data/sources/malt-standard-crosswalk.json`, supplying `standard_malt`
+ `generic_description` (a reliable generic layer over the spotty per-malt
`notes`).

### 2.3 `yeast`

`yeast` carries identity (`id`, `name`, `manufacturer`), `attenuation_cap_pct`
(percentage, `[0, 1]`), the `flocculation` and `form` taxonomies, a display-only
`alcohol_tolerance` string, `temp_low_c`/`temp_high_c` (temperature), and
`recipes`/`url`/`notes`. The full field spec is in `inventory.md`.

### 2.4 `equipment`

The hardware/loss constants: `max_kettle_volume_l`, `max_mash_tun_volume_l`,
`max_hlt_volume_l`, `hlt_coil_floor_l`, `mash_dead_space_l`,
`mash_transfer_loss_l`, `kettle_dead_space_l`, `kettle_transfer_loss_l`,
`hlt_dead_space_l`, `hlt_transfer_loss_l`, `trub_loss_l` (all `volume`),
`boil_off_rate_l_per_hr` (`volume/time`), `grain_absorption_factor_l_per_kg`
(`mash_thickness`), `mash_heating_rate_c_per_min` (`temperature_delta/time`),
`min_lgr_l_per_kg` (`volume/mass`), `conversion_efficiency` and `shrinkage_pct`
(`percentage`), `mash_tun_specific_heat` (`specific_heat`), `mash_tun_mass_kg`
(`mass`). The ramp rate is seeded at 1 °C/min; the minimum LGR at 1.1 qt/lb
(2.295 L/kg). `grain_absorption_factor_l_per_kg` is the authoritative absorption
coefficient: both shipped rigs seed Palmer's baseline 0.125 gal/lb (1.043176 L/kg),
and `constants.k_abs_true` is the fallback when no rig value is supplied.
`hlt_starting_volume_l` is **batch-level**, not an equipment field.

### 2.5 `water_report` / `water_target`

- `water_report` — `{ report_id, date_reported, laboratory, sample_id, source_name,
  location, calcium_ca, magnesium_mg, sodium_na, sulfate_so4, chloride_cl,
  total_alkalinity_caco3, bicarbonate_hco3, ph }` (ions in ppm). `laboratory` is the
  catalog `title_field`. `source_name` / `location` are free-text provenance. The
  seed includes one synthetic `ro-distilled` report — `laboratory` is an explicit
  non-lab convention (`RO / Distilled (definition)`), zero ions, no lab dates — it
  is a definition, not a measurement.
- `water_target` — `{ id, name, description, <ions>, calcium_floor_ppm, mode, notes }`
  (presets like Balanced Pale, Hoppy/IPA, Burton-style IPA, West Coast IPA,
  Hazy IPA). `calcium_floor_ppm` is inherited by the batch root when the preset
  is selected; `mode` is retained as authored metadata. A profile declares **only the ions its
  `mode` targets** — flavour profiles carry SO₄/Cl, buffer profiles add
  alkalinity, and only the all-six clone profile carries every ion. `mode` is
  authored metadata: applying a profile writes `water.strategy = AUTO` and the
  router must derive the same mode from the declared ions. The
  `sulfate_chloride_ratio` field is removed — the ion vector is the only
  authority; the picker may display the implied ratio. RO is a *source report*,
  not a target profile.

### 2.6 `style`

BJCP (2021) beer styles, keyed by the BJCP style number (`1A`…`34C`), plus the
six Specialty IPA sub-types keyed `21B <Name>` (e.g. `21B Black IPA`).

`style` carries identity (`id`, `name`, `category_id`, `category_name`), the
`style_type` taxonomy, optional prose (impression, aroma, appearance, flavour,
mouthfeel, comments, history, ingredients, comparison, entry instructions,
examples, tags) and the optional numeric ranges: `og_min`/`og_max` and
`fg_min`/`fg_max` (gravity), `ibu_min`/`ibu_max` (ibu), `srm_min`/`srm_max`
(beer_color), `abv_min`/`abv_max` (abv), all `gte 0`. The full field spec is in
`inventory.md`.

Specialty styles that define no numerical ranges omit the stat fields. The seed
is built by `scripts/build-styles-seed.mjs` from the **2021** aggregate
`data/sources/bjcp_styles_2021.json` (produced by the vendored BJCP scraper +
aggregator under `scripts/scrape/bjcp/`). The 2015 aggregate
`bjcp_styles_2015.json` is preserved as a source but is not merged. During
normalization:

- category-header records (bare numeric ids like `21`) are dropped, and their
  names supply `category_name`;
- duplicated style ids become composite ids from the sub-name
  (`21B Belgian IPA`, `27A Kellerbier`), and a bare duplicate with no sub-name
  (the `21B Specialty IPA` container) is dropped;
- `vital_statistics` ranges are flattened to `*_min`/`*_max`, arrays are joined
  to comma-delimited strings, and the site's `-` placeholders are omitted.

Selecting a style (the `style` identity record) copy-ins its ranges into the
`batch.style_*_min/_max` envelope roots and sets `batch.fermentation` from its
tags. `batch.target_abv` inherits the artifact default
`(style.abv_min + style.abv_max) / 2`; the host only seeds
`batch.fermentation`. The batch AA is not seeded: it is solved from the grist +
yeast cap. The Style step then re-centers the ABV target on the fixed-AA ray
(see `docs/attenuation-model.md` §6.3).

### 2.7 `hop`

Brewing hops scraped from beer-analytics.com, keyed by a slug of the hop name.

`hop` carries identity (`id`, `name`), optional display metadata (`synonym`,
`category`, `purpose`, `origin`, `alpha_rating`), `recipes_count`, four
percentage quantities (`alpha_acid_pct`, `alpha_acid_min_pct`,
`alpha_acid_max_pct`, `beta_acid_pct`; `[0, 1]`), comma-delimited `pairings` and
`flavor_profiles`, and `notes`/`url`. The full field spec is in `inventory.md`.

`alpha_acid_pct` is the **median** of the scrape's alpha-acid range, stored as a
fraction (6.5% → `0.065`); the boil-hops card back-calculates addition mass from
it via Tinseth. The seed is built by `scripts/build-hops-seed.mjs` from
`data/sources/beer-analytics-hops.json` (produced by
`scripts/scrape/hop_scraper.py`).

### 2.8 `standard-malts` — generic representatives (the default set)

`seeds/standard-malts.json` is a **derived** catalog of one generic
representative per used standard-malt class (81), each conforming to the `malt`
schema with `id = std:<standard-id>` and `maltster: "Generic"`. It is the
neutral default tier over the spotty producer notes: the default grist uses the
generic pale ale + caramel 40L, and the picker surfaces the representative first
inside each standard group (badged "generic").

**Derivation** (`scripts/build-standard-malts-seed.mjs`, regenerated from
`data/seeds/malts.json`):

- `yield_fraction` / `fermentability_fraction` / `color_lovibond` are the
  **median** of the class's members; a missing fermentability falls back to the
  category default.
  The median — not a mean, and *not* a statistical-outlier-filtered mean — is
  chosen because the apparent yield "outliers" are real product traits (oats
  ~0.60, chit ~0.50), which a family or IQR band would wrongly discard.
- `category` is the strict-majority category of the members, with a family
  fallback on a tie (`acidulated` → ACID, `crystal`/`dextrin` → CRYSTAL,
  `roasted`/`dehusked`/`toasted` → ROASTED, else BASE). `category` is load-bearing:
  it drives the water solver's grain-acidity buckets, not just display.
- The `color_lovibond: 0` missing-sentinel is handled upstream: the malt builder
  backfills 0 from the class's non-zero median when it is ≥ 1 °L, keeping 0 only
  for genuine near-zero adjuncts (rice hulls).

**The grouping is a prerequisite, not an assumption.** The representatives are
only as good as the crosswalk, so imprecise assignments were fixed first
(Aromatic Munich 20L → Munich Dark, Dark Wheat, A-XL → Pale Ale, Honey Malted
Oats → Golden Naked Oats, Crystal Oat split out). Known residual: bimodal groups
(Roast Wheat) take their median (a "medium roast"); the dark variants stay
selectable as producer malts.

**Derived + guarded, never silent.** The set tracks the imported catalog: a
re-import that shifts the seed also shifts the medians (and may add a
representative for a newly populated class). `make seeds` runs
`seeds-fermentables` → `seeds-standard-malts`, and a guard fails if the committed
file diverges from the derived medians, so drift is an explicit, reviewable diff.

### 2.9 `hop_product`

Five single-product presets plus one row per lupulin variety. Every row annotates
a leaf; the authoritative product record — leaves, scalars, per-variety tables,
dose guidance and exclusions — is `docs/hops/hop-products.md`.

`hop_product` carries identity and display metadata (`id`, `name`,
`manufacturer`, `brand`), the `hop_product_form` taxonomy leaf (`lupulin_pellet`
for Cryo Hops and Lupomax, `flowable_extract` for the CO₂ extract, Hop Shot,
Flex, DynaBoost and Incognito), `alpha_acid_pct` and its optional
`alpha_acid_min_pct`/`alpha_acid_max_pct` range (percentage, `[0, 1]`; the
preset a lot assay replaces), and `notes`/`url`. The full field spec is in
`inventory.md`.

`data/sources/hop-products.json` holds the entries; the variable percentages are
authored as percentages and `scripts/build-hop-products-seed.mjs` stores fractions
in `data/seeds/hop-products.json`. Cryo and Lupomax are seeded from the
per-variety tables in `docs/hops/hop-products.md`; the other five lines are one
row each. A row may name a variety the T-90 catalogue lacks (the organic and HBC
releases), so `data/seeds/hops.json` is not a prerequisite.

Alpha is a preset, not a constant: the harvest differs and the certificate is
authoritative, so the card asks for the lot assay and prints the published range
where the row carries one.

### 2.10 `mash_rest` / `mash-schedules`

`mash-rests.json` is the rest catalog, keyed by `rest_id` and conforming to the
`mash_rest_definition` schema:

`mash_rest_definition` carries identity and display prose (`rest_id`, `name`,
`purpose`), a recommended `temp_min_c`/`temp_max_c` (temperature),
`default_duration_min` (time; seeded when a rest is first enabled) and the
canonical `sequence` (dimensionless; mash-out last). The full field spec is in
`inventory.md`.

`mash-schedules.json` is the preset matrix, keyed by the `mash_preset` taxonomy:
each entry has `{ id, name, rests[] }`, where `rests` rows conform to the
`mash_rest` collection schema. The host applies a preset from these rows and
preserves mash-out as independent user state. `mash.total_time_min` is a derived
node over the enabled rows; it will gain ramp time when the ramp model lands.

---

## 3. How the engine consumes seeds

- **Container shape:** every catalog seed is a flat **id-keyed map**
  (`{ "<id>": { ...component... } }`), where each component conforms to its
  `primitive_schema`. The exception is `mash-schedules.json`, a
  `{ schedule_id → { id, name, rests[] } }` preset template whose `rests` are
  ordered. (`water_report` is keyed by `report_id`; `water_target` ions are flat,
  not nested under `ions`.)
- Selections resolve a `ref` (id) against the seed/component store into a typed,
  read-only value (per the schema).
- The six working ions for a water source are **derived from the lab report**
  (`source` is never entered independently in report mode): alkalinity is
  `total_alkalinity_caco3`, falling back to `bicarbonate_hco3 × (50/61)`.
- Dotted sub-refs (`equipment.mash_tun_specific_heat`, `grist.major_malts`)
  resolve through the schema.

---

## 4. Provenance and copy-forward

The freeze records `source_template_id` per embedded component plus
`schema_version`. That is provenance only — the batch already owns a full copy of
every selected component, so a later library edit or seed change cannot alter it.
There is no content hash and no drift detection.

Records vs seeds vs batch state:

- **Seed** — bundled, read-only, replaced only by a code deploy.
- **Record** — immutable, per-user, server-persisted; delete it and existing
  batches still hold their copies.
- **Batch selection snapshot** — the batch's own copy, captured when the
  component is picked; it survives save/load/freeze and is what the engine reads.
  A legacy draft without a snapshot materialises one from the current library on
  load and persists it on the next save.
