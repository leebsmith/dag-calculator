# Seed Substrate

The **seed substrate** is the immutable reference data the engine resolves
against. It is *data*, not logic — the artifact **schematizes** it and
**references it by id**, but does not contain it.

---

## 1. The facts-vs-rules split

| Class | Examples | Editable? | Lives |
|---|---|---|---|
| **Immutable seeds** | malt/sugar/yeast catalogs, water lab reports, equipment presets | no | seed JSON (a separate data substrate) |
| **User-authored items** | "my house malt", "my tap water", "my 3-vessel rig" | yes (CRUD) | device-local localStorage overlay |
| **Ephemeral batch input** | manual water entry, batch roots | yes (batch-scoped) | the batch draft |

The key line: **catalogs and reports are facts; they are never edited.** The
artifact's `primitive_schemas` define *what a malt / yeast / water report / …
is*; the seed JSON holds the *instances*.

**User-authored items** are a third class between the two: full components
conforming to the same `primitive_schema`, owned by the user and stored under a
reserved `u:` id prefix (so they can never collide with a seed id). They are
merged into the reference cache as a **live overlay** (`user > seed`, see
`store/userCatalog.js` + `store/referenceCache.js syncUserItems`) so pickers and
selection resolution treat them exactly like seeds — and selection-referenced
items inherit provenance/drift (§4). They are device-local for now (Firestore
later); `malt`, `yeast`, `hop`, `sugar`, `equipment`, `water_report`, and
`water_target` support user items.

Physical constants (sucrose yield, salt stoichiometry, acid properties) live in
the artifact's `constants`/`functions`, **not** in seed JSON — seed data is
reserved for profile-specific presets.

---

## 2. Primitive schemas

`primitive_schemas` declare the shape of each seed/component type. Each field
carries a `dimension`, an optional `domain`, and an optional `default`.

### 2.1 `malt`

| Field | Dimension | Domain | Notes |
|---|---|---|---|
| `id`, `name` | — | — | identity/metadata |
| `maltster` | — | — | producer (provenance) |
| `standard_malt` | — | — | standard classification id (generic family) |
| `standard_name` | — | — | standard display name (e.g. "Pale Ale Malt") |
| `family` | — | — | standard family (base/kilned/crystal/roasted/…) |
| `generic_description` | — | — | shared one-line description from the standard list |
| `category` | taxonomy `malt_category` | — | `BASE`/`CRYSTAL`/`ROASTED`/`ACID` |
| `yield_fraction` | percentage | `[0, 1]` | dry-basis extract yield |
| `moisture_fraction` | percentage | `[0, 1]` | as-is moisture, where the datasheet publishes it (`0`/absent ⇒ not published) |
| `color_lovibond` | grain_color | `gte 0` | dry-malt color |

**Moisture is a per-malt seed field where published.** `moisture_fraction` comes
from the datasheet (`moisture %/100`); malts that publish none carry no field.
`batch.grain_moisture_fraction` (default 4%) is the **fallback** for such rows:
the request adapter sends `mc_i = row.moisture_fraction ?? batch.grain_moisture_fraction`
per row, and the boundary computes the weighted `MC_bar = Σ wᵢ·mcᵢ`.

Mash pH/acidity is **not** a seed field either. The water solver derives grain
acidity from `category` + `color_lovibond` (a category color-slope model in
`backend/app/core/water.py`). There is no per-malt `di_ph`/`buffer_index` to
source or maintain.

### 2.2 `sugar`

| Field | Dimension | Domain |
|---|---|---|
| `id`, `name` | — | — |
| `maltster` | — | — |
| `yield_fraction` | percentage | `[0, 1]` |
| `color_lovibond` | grain_color | `gte 0` |

The malt and sugar seeds are built by `scripts/build-fermentables-seed.mjs`
from the vendored `data/sources/malt-database-malts.json` scrape (deduped
one-per-name, `malt`+`adjunct` → malts, `sugar`+`syrup`+`extract` → sugars).
Each malt is classified against `data/sources/standard-malts.json` via the
committed `data/sources/malt-standard-crosswalk.json`, supplying `standard_malt`
+ `generic_description` (a reliable generic layer over the spotty per-malt
`notes`).

### 2.3 `yeast`

| Field | Dimension | Domain |
|---|---|---|
| `id`, `name`, `manufacturer` | — | — |
| `attenuation_pct` | percentage | `[0, 1]` |
| `flocculation` | taxonomy `flocculation` | `Low`/`Medium`/`High` |
| `alcohol_tolerance` | — | display string (`12.0%`, `High`, …) |
| `form` | taxonomy `form` | `Dry`/`Liquid` |
| `temp_low_c`, `temp_high_c` | temperature | — |
| `recipes`, `url`, `notes` | — | — |

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
- `water_target` — `{ id, name, description, calcium_ca, magnesium_mg, sodium_na,
  sulfate_so4, chloride_cl, alkalinity_as_caco3, sulfate_chloride_ratio,
  calcium_floor_ppm, notes }` (presets like RO/Distilled, Balanced Pale, Hoppy/IPA…).

### 2.6 `style`

BJCP (2021) beer styles, keyed by the BJCP style number (`1A`…`34C`), plus the
six Specialty IPA sub-types keyed `21B <Name>` (e.g. `21B Black IPA`).

| Field | Dimension | Domain |
|---|---|---|
| `id`, `name`, `category_id`, `category_name` | — | — |
| `type` | taxonomy `style_type` | `beer`/`mead`/`cider` |
| `overall_impression`, `aroma`, `appearance`, `flavor`, `mouthfeel`, `comments`, `history`, `characteristic_ingredients`, `style_comparison`, `entry_instructions`, `commercial_examples`, `tags` | — | optional prose |
| `og_min`, `og_max`, `fg_min`, `fg_max` | gravity | `gte 0` (optional) |
| `ibu_min`, `ibu_max` | ibu | `gte 0` (optional) |
| `srm_min`, `srm_max` | beer_color | `gte 0` (optional) |
| `abv_min`, `abv_max` | abv | `gte 0` (optional) |

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

Selecting a style (the `batch.style` selection) copy-ins its ranges into the
`batch.style_*_min/_max` envelope roots, sets `batch.fermentation` from its tags,
and derives a single AA/ABV target from the style's feasible-region centroid
(`docs/style-card-centroid.md`), seeding `batch.apparent_attenuation` and
`batch.target_abv`.

### 2.7 `hop`

Brewing hops scraped from beer-analytics.com, keyed by a slug of the hop name.

| Field | Dimension | Domain |
|---|---|---|
| `id`, `name` | — | identity/metadata |
| `synonym`, `category`, `purpose`, `origin`, `alpha_rating` | — | optional display metadata |
| `recipes_count` | — | integer |
| `alpha_acid_pct`, `alpha_acid_min_pct`, `alpha_acid_max_pct`, `beta_acid_pct` | percentage | `[0, 1]` |
| `pairings`, `flavor_profiles` | — | comma-delimited strings |
| `notes`, `url` | — | prose / provenance |

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

- `yield_fraction` / `color_lovibond` are the **median** of the class's members.
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

---

## 3. How the engine consumes seeds

- **Container shape:** every catalog seed is a flat **id-keyed map**
  (`{ "<id>": { ...component... } }`), where each component conforms to its
  `primitive_schema`. The exception is `mash-schedules.json`, a
  `{ schedule_id → rests[] }` template whose `rests` are ordered. (`water_report`
  is keyed by `report_id`; `water_target` ions are flat, not nested under `ions`.)
- Selections resolve a `ref` (id) against the seed/component store into a typed,
  read-only value (per the schema).
- The six working ions for a water source are **derived from the lab report**
  (`source` is never entered independently in report mode): alkalinity is
  `total_alkalinity_caco3`, falling back to `bicarbonate_hco3 × (50/61)`.
- Dotted sub-refs (`equipment.mash_tun_specific_heat`, `grist.major_malts`)
  resolve through the schema.

---

## 4. Provenance

The freeze records, per embedded component: `source_template_id` +
`source_revision` (content hash) + `schema_version`. If a seed changes under a
frozen batch, the revision mismatch is detected and reported — drift is explicit,
never silent.
