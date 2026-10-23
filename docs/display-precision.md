# Display Precision

Canonical decimal policy for shown numeric values. The artifact owns values and
domains; this document owns how many digits the presentation layer renders.

The policy is implemented in `frontend/src/views/registry/units.js`
(`DIMENSION_DECIMALS` and per-unit decimals) and consumed by scalar fields,
collection columns, and readout tables.

## Dimensions

| Dimension | Precision | Notes |
|---|---|---|
| `temperature` | 1 | °C and °F |
| `temperature_delta` | 1 | Δ°C and Δ°F; label the delta unit |
| `time` | `min` 0, `hr` 1, `day` 1 | |
| `volume` | 1 | L, gal, qt, mL |
| `volume_per_time` | 1 | L/hr, gal/hr |
| `mass` | 1 | kg, lb, oz, g |
| `gravity` | SG 3, Plato 1 | |
| `grain_color` | 1 | °L, EBC |
| `beer_color` | 1 | SRM, EBC |
| `percentage` | `pct` 1, `fraction` 3 | |
| `ph` | 2 | |
| `concentration` | 1 | ppm |
| `abv` | 1 | % |
| `ibu` | 1 | IBU |
| `specific_heat` | 2 | |
| `mash_thickness` | 2 | L/kg |
| `extract_yield` | 2 | |
| `total_extract` | 1 | |
| `dimensionless` | natural | Rounded to 3 dp where a table needs a string |
| `reference`, taxonomies | none | Categorical, not numeric |

## Precedence

1. Per-field registry `decimals`
2. Per-unit decimals
3. Dimension decimals
4. `formatValue` fallback (integer/trimmed 3 dp)

Per-field overrides are reserved for deliberate deviations, such as water
additions in grams at 1 dp or the hop card's mass display.

## Inputs

Numeric inputs render their natural value and ignore the readout precision. That
is deliberate: fixed-decimal padding would rewrite a field while the user is
typing. Long defaults should be rounded in the artifact rather than formatted by
the input.

Readout tables honour per-field registry `decimals` and `displayUnit` overrides
the same way scalar readouts do.
