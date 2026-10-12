# Dimensions & Units

This document defines the dimension system: base dimensions, special
dimensions, derived (compound) dimensions, and the four transform kinds. Unit
conversion is **derived** from a value's dimension — there is no per-field
conversion registry.

---

## 1. Transform kinds

Every dimension declares a `kind` governing how its display units map to the
base unit:

| Kind | Shape | Use |
|---|---|---|
| `linear` | `{ factor }` | unit = base × factor (or base = unit ÷ factor) |
| `affine` | `{ factor, offset }` | unit = base × factor + offset |
| `nonlinear` | `{ fwd, inv }` (function ids) | an arbitrary invertible pair |
| `identity` | (none) | dimensionless; no conversion |

Examples:

- `mass` kg→lb: **linear** (factor 0.45359237).
- `temperature` °C→°F: **affine** (factor 1.8, offset 32).
- `gravity` SG↔Plato: **nonlinear** (ASBC cubic + numeric inverse).
- `dimensionless`: **identity**.

---

## 2. Base dimensions

| id | base unit | kind | note |
|---|---|---|---|
| `mass` | kg | linear | lb = 0.45359237 kg, g = 0.001 kg |
| `volume` | L | linear | gal = 3.785411784 L, qt = 0.946352946 L |
| `temperature` | °C | affine | °F = 1.8·°C + 32 |
| `time` | min | linear | (minutes are the only unit in use) |

---

## 3. Special dimensions

These are **not** physical base dimensions, but domain quantities with their own
unit semantics.

### 3.1 `gravity` — dimensionless, nonlinear

Base unit **SG**. `Plato` is a nonlinear transform of SG via the ASBC polynomial:

- `SG → Plato`: `P = −616.868 + 1111.14·SG − 630.272·SG² + 135.997·SG³`
- `Plato → SG`: the numeric inverse (Newton–Raphson).

Both directions are exact inverses (lossless round-trip). Expressed as a
`nonlinear` transform pair (`fwd`/`inv`).

### 3.2 `color` — affine chain through SRM

Base unit **Lovibond** (°L). Conversion to SRM and EBC is a two-step **affine**
chain:

- `Lovibond → SRM` (Morey): `SRM = 1.3546·L − 0.76`
- `SRM → EBC` (linear): `EBC = 1.97·SRM`  (from 25 / 12.7)

Composed:

- `EBC = 1.97·(1.3546·L − 0.76) = 2.6686·L − 1.4972`
- `Lovibond = (EBC / 1.97 + 0.76) / 1.3546`

> **Reconciliation note.** The legacy code used a flat `EBC = 1.97·Lovibond`
> (treating Lovibond ≈ SRM). That was an approximation; the Morey equation above
> is authoritative. The reference implementation (`scripts/water-chemistry-module.py`)
> already encoded the correct affine inverse (`0.375·EBC + 0.561`).

### 3.3 `percentage` — display scalar

Base unit **fraction** (0..1). Display `%` = fraction × 100. Linear.

---

## 4. Derived (compound) dimensions

Derived dimensions are **compositions of base dimensions**. Their display
conversions are the **composition of the base conversions** — no independent
constants.

| id | composition | example conversion |
|---|---|---|
| `mash_thickness` | volume / mass | qt/lb = 0.946352946 L ÷ 0.45359237 kg = **2.08635** L/kg |
| `specific_heat` | energy / (mass · ΔT) | BTU/(lb·°F) = kcal/(kg·°C) exactly → factor **1.0** |
| `total_extract` | volume · gravity | gal·pts = **3.785411784** L·° |
| `extract_yield` | volume · gravity / mass | L·°/kg ↔ gal·°/lb = 3.785411784 ÷ 0.45359237 = **8.3454** |

These recovered constants **match** the known-good code (2.08635, 3.785411784,
8.3454, and the specific-heat identity). The derived model explains what the code
hardcoded.

---

## 5. Dimension checking (the engine's job)

The engine validates every expression against dimensions:

- Adding/mixing **same-dimension** values is legal.
- Adding a `temperature` and a `temperature_delta` is legal (affine units have
  no offset in a delta).
- Adding a `temperature` and a `volume` is **illegal** (validation error).
- Reductions preserve dimension: `sum`/`weighted_avg` of `mass` → `mass`.

`temperature_delta` is a **distinct dimension** from `temperature` (linear, no
offset: Δ°F = 1.8·Δ°C) precisely so that `T + ΔT` type-checks while `T + T` is
flagged.
