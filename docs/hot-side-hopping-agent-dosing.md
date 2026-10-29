# Hot-side hop dosing frameworks

Status: vendored reference. This is a generated Gemini conversation (retrieved
2026-10-29) plus one supplier data sheet, kept as the product-form and dosing
background for the whirlpool model. It is background, not the implementation
contract: [`whirlpool-hopping-model.md`](whirlpool-hopping-model.md) owns the
equations, and where the two disagree the model document wins.

Sources named by the conversation: the YCH 702 guide (Ollie), BarthHaas
Spectrum, and Perkins/Malowicki for the activation energy. Appendix A is the
Yakima Chief Hops early-kettle data sheet formula.

## 1. T-90 pellet equivalence ratios (w/w)

The most common commercial specification for late-boil and whirlpool extracts or
concentrated powders is a direct mass-to-mass replacement ratio against standard
T-90 pellets. Because these products strip away non-essential vegetative
cellulose to eliminate whirlpool trub loss, suppliers standardize their oil and
resin concentrations to mimic a fixed multiple of raw pellet mass:

- **Flowable whirlpool extracts** (YCH DynaBoost / 702, Haas Incognito): a
  `1:6` to `1:10` replacement ratio by weight. `1 g` of DynaBoost replaces `10 g`
  of T-90 (`1:10`); Incognito is typically `1:6` to `1:8` in the whirlpool.
- **Cryogenic and enriched lupulin powders** (Cryo Hops, Lupomax): `1:2` (50 %)
  to `1:1.4` (70 %) mass replacement.
- **Polyphenol and mouthfeel ceiling**: technical data sheets also specify a
  maximum substitution percentage (typically 50–75 % of the hot-side bill).
  Replacing 100 % of T-90 with pure lipid/oil extracts strips hop-derived
  polyphenols and tannins, thinning mouthfeel, altering protein coagulation and
  reducing haze stability.

## 2. Target IBU and alpha-acid mass (mg/L)

Dedicated hot-side bittering extracts added at the start of the boil (Haas Flex,
supercritical CO₂ extract) are dosed stoichiometrically by target bitterness
rather than bulk weight. They lack solid plant matter and enter the kettle
pre-dissolved, so their isomerization kinetics are faster than whole cones or
T-90. Dosing requires:

1. **Target IBU contribution** — the exact mg/L of iso-alpha acids desired.
2. **Standardized alpha-acid concentration** — pure CO₂ extracts vary by lot
   (40–65 % alpha); flowable bittering products like Flex are standardized
   (typically 60 % w/w).
3. **Modified utilization factor** — standard Tinseth or Rager curves
   under-predict extract bitterness. Extracts need a `1.15×` to `1.25×`
   utilization multiplier (32–38 % utilization in a 60-minute boil against
   25–30 % for pellets).

```
mass_extract (g) = target IBU × V_batch (L) / (AA% × U_extract × 1000)
```

Appendix A records the supplier form of the same sum.

## 3. Direct volumetric and mass-per-volume rates

Flowable hot-side agents are also specified directly by mass or volume per unit
of knockout wort, bounded by saturation ceilings:

- **Whirlpool rates**: commonly `0.5` to `2.0 g/L` (`0.06` to `0.26 oz/gal`).
  Suppliers cap hot-side extract additions at `2.0 g/L`; above it, lipid phase
  separation, oily surface slicks and foam degradation follow.
- **Density**: flowable extracts are viscous at room temperature and are warmed
  to 40–50 °C before dosing. Product density is typically `0.95–1.05 g/mL`, so a
  gravimetric dose converts to a volume.

## 4. Total essential oil loading (mL oil / hL)

Late hot-side additions are increasingly specified by total volatile oil volume
per unit wort (mL per hL, i.e. mL per 100 L). Flowable extracts are standardized
by total oil (DynaBoost 10–12 % v/w against 0.8–3.0 % in raw pellets), which
isolates aromatic intensity from alpha-acid crop variation:

- Subtle / noble whirlpool: `0.5–1.5 mL/hL`
- Modern pale ale / West Coast IPA: `2.0–4.0 mL/hL`
- Saturated hazy IPA: `4.5–8.0+ mL/hL`

## 5. Comparison of hot-side dosing specifications

| Product class | Examples | Primary metric | T-90 equivalence | Modelling adjustment |
|---|---|---|---|---|
| Cryogenic lupulin | Cryo Hops, Lupomax | Mass (g/L) | 1:2 (50 % of T-90) | ~50 % less vegetative absorption; +5 % whirlpool utilization |
| Flowable CO₂ extracts | DynaBoost (YCH 702), Incognito | Equivalence (w/w) or g/L | 1:6 to 1:10 | Zero absorption; `≤2 g/L` ceiling; 10–15 % isomerization penalty in a 75–85 °C whirlpool |
| Standardized bittering | Haas Flex, supercritical CO₂ | Target IBU (mg/L iso-AA) | exact AA% (60 %) | Zero absorption; `1.15×–1.25×` boil utilization over Tinseth |
| Hot-side oil fractions | Terpene / sesquiterpene fractions | Volume (mL/hL) | varietal oil equivalent | Zero IBU (AA% = 0); zero absorption; dose at `≤80 °C` |

## 6. Timing and kinetic trade-offs

| Product class | Addition timing | Bitterness impact | Aroma / oil impact | Wort and process impact |
|---|---|---|---|---|
| Standardized bittering | Early boil (60–90 min) | Maximum isomerization; `+15–25 %` utilization over T-90 | Complete stripping of monoterpenes; clean neutral bitterness | Zero trub, no absorption; polyphenol loss reduces hot-break coagulation |
| Cryogenic lupulin | Late boil (15–5 min) or whirlpool to 80 °C | Slightly higher utilization (`+5–10 %`) from concentrated lupulin | 10–15 min of boil strips grassy hydrocarbons; sub-85 °C preserves esters | Halved vegetative loss; retains enough polyphenol for flocculation |
| Flowable CO₂ extracts | Flameout / whirlpool (95–80 °C) or dip hop | Non-isomerized alpha: ~10–15 % utilization at 95 °C, near zero at 80 °C; raw alpha/beta contribute perceived bitterness | Avoids steam distillation; biotransformation when carried into the fermenter | 100 % wort recovery; needs shear and `>75 °C` to emulsify; `>2 g/L` destroys foam |
| Hot-side oil fractions | Sub-isomerization whirlpool (`≤80 °C`) or inline knockout | Zero IBU; no alpha, beta or iso-alpha | Flash-off critical: dosing at a rolling boil strips the oil | Zero trub, zero polyphenol, zero wort loss |

- **The 80 °C isomerization threshold**: above it, alpha acids continue to
  isomerize while myrcene and other monoterpenes flash off. Cooling to 75–80 °C
  before dosing arrests IBU accumulation and preserves aromatic oil.
- **Viscosity vs volatility**: cooling below ~70 °C protects aromatics but makes
  the resin too viscous to emulsify; it smears on kettle walls or settles into
  the trub cone. Flowables need 80–95 °C and mechanical shear.

## 7. Temperature-dependent whirlpool modelling

The whirlpool is a coupled system: Arrhenius-driven isomerization in one
direction, vapor-pressure and solubility-driven oil retention in the other, plus
an emulsification boundary for flowables.

### 7.1 Sub-boiling isomerization

Alpha-acid isomerization is first-order with an empirical activation energy of
about 79.1–88.0 kJ/mol (Perkins/Malowicki). Relative to a 100 °C boil:

```
f_temp(T) = exp(-(Ea/R) × (1/T - 1/373.15))
```

With `Ea/R ≈ 9500 K`: 98 °C ≈ 0.87, 90 °C ≈ 0.49, 85 °C ≈ 0.34, 80 °C ≈ 0.23,
75 °C ≈ 0.16 of boiling speed. The implemented model uses `9773 K` instead (see
the model document's reconciliation section).

### 7.2 Non-isothermal cooling integral

A whirlpool rarely sits at one temperature, so integrate the relative rate over
the cooling curve and feed the result into the Tinseth time decay:

```
t_eff = ∫ f_temp(T(t)) dt
U_wp  = M_form × f_gravity(G) × (1 - exp(-0.04 × t_eff)) / 4.15
```

### 7.3 The product-form multiplier

| Form | `M_form` | Notes |
|---|---|---|
| T-90 pellets | 1.0 | baseline |
| Cryo / Lupomax | 1.05–1.10 | static across the temperature window |
| Flowable CO₂, above 90 °C | ≈1.15 | low viscosity, pre-ruptured resin |
| Flowable CO₂, near 75 °C, low shear | 0.75–0.85 | lipid viscosity climbs, globules form, utilization falls below T-90 |

The document gives both a "10–15 % penalty" and a `0.75–0.85` multiplier for the
cool case, which are not the same number. The implementation takes the
`0.75–0.85` endpoints as authoritative.

### 7.4 Oil retention and non-iso bitterness (deferred)

- Split total oil into non-polar hydrocarbons (myrcene, humulene, caryophyllene;
  70–80 %) and oxygenated terpenoids (linalool, geraniol; 20–30 %). Each decays
  first-order with a temperature-dependent volatilization constant, capped by
  aqueous solubility (myrcene saturates around 0.5–1.5 mg/L).
- Pellets adsorb non-polar oil onto the trub cone; extracts and oil fractions do
  not.
- Humulinones (oxidized alpha, 0.2–0.5 % in T-90, 0.5–1.0 % in Cryo/Lupomax) are
  water-soluble at 75 °C, about 66 % as bitter as iso-alpha, and register on
  spectrophotometric IBU. Supercritical CO₂ extracts contain almost none.
- Un-isomerized alpha and hulupones dissolve in warm turbulence up to their
  solubility limit (~14–20 mg/L, ~5–10 mg/L after fermentation pH drops).

These are recorded as design background; the model outputs iso-alpha IBU only.

### 7.5 Architectural checkpoints

- **Thermal profile vs point temperature**: a single hold temperature, or passive
  cooling from flameout with an equipment-specific decay constant.
- **Bitterness output**: true iso-alpha (mg/L) only, or a perceived /
  spectrophotometric IBU that layers dissolved humulinones from pellets and Cryo
  against pure CO₂ extracts.
- **Oil representation**: one normalized surviving-oil yield, or separate
  hydrocarbon and oxygenated fractions.

The implemented model answers these as: passive Newton cooling from the row's
initial temperature with a batch-level decay constant, true iso-alpha IBU, and no
oil prediction.

## Appendix A — Yakima Chief Hops early-kettle dosing formula

From the YCH product data sheet for early-kettle additions:

> Addition during early kettle boil to achieve average bitterness in high
> gravity wort/beer will typically lead to the isomerisation of 35 % (by HPLC) of
> the iso-alpha acids in the finished beer. Addition rate is thus calculated as
> follows:
>
> `kg product = IBU / 35 × hl / Alpha%`
>
> Where: IBU = international bitterness unit desired, hl = hectolitres of
> finished beer (1 barrel = 1.173 hectolitre), Alpha % = alpha %w/w content from
> the CoA as a whole number. Use rates may vary depending on the brewing process
> and the desired hopping level.

The 35 % is a supplier dosing constant for standardised bittering products, not a
Tinseth coefficient: it ignores gravity and time, and it sits above the
`1.15×–1.25×` multiplier band in §2. The model does not implement it; the boil
path has no product-form field yet.
