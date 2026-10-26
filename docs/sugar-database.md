# The sugar database

**Status:** living. `data/sources/sugar-fermentability.json` is the audited
source; `data/sources/sugar-fermentability.schema.json` pins its shape;
`scripts/build-fermentables-seed.mjs` applies it as a null-fill overlay;
`tests/guards/sugar-fermentability-contract.test.js` enforces the contract.

The brewing engine consumes two axes per late addition: **as-is extract** and
**real fermentability**. The database stores the three physical tiers those
axes are derived from, because most brewing databases collapse them and inherit
systematic errors.

## 1. The three tiers

| Tier | Stored field | Derivation | Notes |
|---|---|---|---|
| Dry matter | `dry_matter_fraction` | ASBC Sugars and Syrups-3 (vacuum oven, Karl Fischer, RDS) | Moisture is `1 − dry matter`; optical Brix is not RDS for impure syrups |
| Gravity potential | `ppg_as_is`, `l_deg_per_kg` | `46.21 × dry_matter × extract_efficiency`; `L°/kg = PPG × 8.3454` | Normalized to the repository's sucrose reference |
| True fermentability | `rdf`, `rdf_min`, `rdf_max` | ASBC Sugars and Syrups-15 / vendor forced fermentation | Real, never apparent attenuation |

`extract_efficiency_factor` absorbs ash, salts, organic acids and molecular
packing deviations relative to sucrose. It is `1.000 ± 0.005` for refined
sugars; molasses and unrefined syrups can deviate more. `sulfated_ash_fraction`
and `carbohydrate_profile` are audit fields: the solver never consumes them.

The seed derives exactly:

```
yield_fraction          = dry_matter_fraction × extract_efficiency_factor
fermentability_fraction = rdf
```

## 2. The four traps

1. **Dextrose monohydrate vs anhydrous.** Commercial corn sugar carries 8.5–9.1 %
   water of crystallization. Its as-is potential is ~41.8 PPG, not 46.2.
2. **As-is vs dry basis.** Vendor syrup spectra are often quoted on dry
   substance. Scale by dry matter before computing wort gravity.
3. **RDF vs ADF.** A pure sugar has `RDF = 1.0` even though its apparent
   attenuation can exceed 1.2. Sugar ADF must never be run through the malt
   12 °P conversion.
4. **Refractive index vs dry substance.** In molasses, dark candi and maple,
   non-sugar solids raise optical Brix above true RDS. Prefer Karl Fischer,
   vacuum oven or RDS.

## 3. Overlay policy

The builder applies the audited source as a **null-fill overlay**:

- a null seed figure is filled from the source;
- a non-null seed figure wins;
- a disagreement is reported by the build and kept for review — never silently
  overwritten.

The current review list is the non-null conflicts (corn sugar, invert,
candi syrups, molasses, maple, corn syrup, and the rice-syrup RDF). They are known and documented; a
future correction pass can promote them.

Definitional rows are explicit: lactose `RDF = 0`; sucrose and pure dextrose
`RDF = 1`; dextrose monohydrate `yield = 0.909`, `RDF = 1`.

## 4. Effective fermentability

The wire carries one scalar, `sugar_fermentability`:

```
F_eff = Σ(extract_i · F_i) / Σ(extract_i)
```

- dose mode: weight by `mass × yield`;
- share mode: weight by `parts` (the extract allocation).

Share mode therefore supports mixed blends. A 10 % sugar-extract share that is
half lactose and half molasses has `F_eff ≈ 0.5`; 5 % of total extract is
fermentable sugar and 5 % is unfermentable residue. The share is **total sugar
extract**, not fermentable extract; the UI shows both.

RDF ranges use the midpoint as the solver point. The range stays in provenance
and is shown in the UI (A8: bounds are reported, not propagated).

## 5. Citations

Every row carries a primary vendor or definitional citation, a method, a URL,
`retrieved_at`, and a SHA-256. The current hash is a fingerprint of the
vendor/method tuple; page-byte capture is tracked as a follow-up. The source
manifest pins the file's content hash and row count.

## 6. Standards

- ASBC Sugars and Syrups-3/4/5/14/15.
- EBC Analytica Section 4 (sugars, syrups, caramels).
- ICUMSA GS4-13 (RDS), GS1/3/7-5 (invert), GS2/3-10 (sulfated ash).
- CRA E-26 (DE), B-48 (moisture in dextrose).
