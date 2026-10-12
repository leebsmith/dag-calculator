# Worked Example — Strike-Water Chain & Color

This walks a small slice of the artifact end-to-end, showing how the five node
kinds, the expression AST, the dimension system, and a boundary interlock.

---

## 1. The strike-water chain

The slice computes the strike-water temperature from: the dough-in target, the
grain temperature, the mash-tun thermal mass (from the *equipment selection*),
and the **solver-resolved** mash thickness and strike volume (from the *batch
boundary*).

### 1.1 Roots

```jsonc
"mash.grain_temp_c": {
  "kind": "root", "dimension": "temperature",
  "default": { "const": "default_grain_temp_c" }, "domain": { "gte": 0 }
},
"mash.tun_initial_temp_c": {
  "kind": "root", "dimension": "temperature",
  "default": { "const": "default_grain_temp_c" }, "domain": { "gte": 0 }
},
"mash.dough_in_target_temp_c": {
  "kind": "root", "dimension": "temperature"
}
```

> In the *full* artifact, `dough_in_target_temp_c` is `derived` from the first
> enabled mash rest; it is a root here only to keep the example self-contained.

### 1.2 Selection

```jsonc
"equipment.profile": {
  "kind": "selection", "schema": "equipment",
  "ref": "batch.equipment_profile_id",
  "overlay": { "mash_tun_mass_kg": 7.5 }
}
```

`equipment.mash_tun_specific_heat` and `equipment.mash_tun_mass_kg` resolve
through the `equipment` schema; the overlay overrides `mash_tun_mass_kg` to 7.5
for this batch only.

### 1.3 Boundary

```jsonc
"solver.batch": {
  "kind": "boundary", "binding": "batch_sparge_solver", "resolution": "iterative",
  "inputs":  { "target_abv": "batch.target_abv", "grain_bill": "grist.major_malts", "…": "…" },
  "outputs": {
    "mash_thickness_l_per_kg": { "dimension": "mash_thickness" },
    "v_strike":                { "dimension": "volume" }
  }
}
```

The derived nodes below read `solver.batch.mash_thickness_l_per_kg` and
`solver.batch.v_strike` **as ordinary values** — they cannot tell (and must not care)
that these came from a black box.

### 1.4 Functions

```jsonc
"calculate_strike_water_base_temp": {
  "params": ["t_target", "t_grain", "thickness"], "returns": "temperature",
  "body": { "op": "+", "args": [
    { "ref": "t_target" },
    { "op": "*", "args": [
      { "op": "/", "args": [ { "const": "mash_thermal_factor" }, { "ref": "thickness" } ] },
      { "op": "-", "args": [ { "ref": "t_target" }, { "ref": "t_grain" } ] }
    ]}
  ]}
},
"calculate_tun_thermal_offset": {
  "params": ["t_target", "tun_initial", "specific_heat", "tun_mass", "water_mass"],
  "returns": "temperature_delta",
  "body": { "op": "*", "args": [
    { "op": "/", "args": [
      { "op": "*", "args": [ { "ref": "specific_heat" }, { "ref": "tun_mass" } ] },
      { "op": "*", "args": [ { "const": "water_specific_heat" }, { "ref": "water_mass" } ] }
    ]},
    { "op": "-", "args": [ { "ref": "t_target" }, { "ref": "tun_initial" } ] }
  ]}
}
```

### 1.5 Derived nodes

```jsonc
"mash.strike_water_temp_base_c": {
  "kind": "derived",
  "inputs": {
    "t_target":  "mash.dough_in_target_temp_c",
    "t_grain":   "mash.grain_temp_c",
    "thickness": "solver.batch.mash_thickness_l_per_kg"
  },
  "expr": { "call": "calculate_strike_water_base_temp",
            "args": [ { "ref": "t_target" }, { "ref": "t_grain" }, { "ref": "thickness" } ] },
  "output": { "dimension": "temperature" }
},
"mash.strike_water_tun_offset_c": {
  "kind": "derived",
  "inputs": {
    "t_target":      "mash.dough_in_target_temp_c",
    "tun_initial":   "mash.tun_initial_temp_c",
    "specific_heat": "equipment.mash_tun_specific_heat",
    "tun_mass":      "equipment.mash_tun_mass_kg",
    "water_mass":    "solver.batch.v_strike"
  },
  "expr": { "call": "calculate_tun_thermal_offset",
            "args": [ { "ref": "t_target" }, { "ref": "tun_initial" },
                      { "ref": "specific_heat" }, { "ref": "tun_mass" }, { "ref": "water_mass" } ] },
  "output": { "dimension": "temperature_delta" }
},
"mash.strike_water_temp_c": {
  "kind": "derived",
  "inputs": { "base": "mash.strike_water_temp_base_c", "offset": "mash.strike_water_tun_offset_c" },
  "expr": { "op": "+", "args": [ { "ref": "base" }, { "ref": "offset" } ] },
  "output": { "dimension": "temperature" }
}
```

### 1.6 The dimension check

`strike_water_temp_c` adds a `temperature` (`base`) and a `temperature_delta`
(`offset`). The engine's dimension checker accepts this (an affine temperature
plus a linear delta). If it added two `temperature`s, or a `temperature` and a
`volume`, it would reject the expression at load time.

---

## 2. The color chain

### 2.1 Collection + reduction

```jsonc
"grist.major_malts": { "kind": "collection", "item_schema": "grist_row" },

"grist.weighted_lovibond": {
  "kind": "derived",
  "inputs": { "rows": "grist.major_malts" },
  "expr": { "op": "weighted_avg", "coll": { "ref": "rows" }, "as": "row",
            "value": { "ref": "row.color_lovibond" }, "weight": { "ref": "row.pct" } },
  "output": { "dimension": "color" }
}
```

### 2.2 Function + derived finished-beer color

```jsonc
"morey_lovibond_to_srm": {
  "params": ["lovibond"], "returns": "color",
  "body": { "op": "-", "args": [ { "op": "*", "args": [ 1.3546, { "ref": "lovibond" } ] }, 0.76 ] }
},

"grist.beer_srm": {
  "kind": "derived",
  "inputs": { "lovibond": "grist.weighted_lovibond" },
  "expr": { "call": "morey_lovibond_to_srm", "args": [ { "ref": "lovibond" } ] },
  "output": { "dimension": "color" }
}
```

> The full finished-beer color uses MCU → Morey (`1.4922·MCU^0.6859`) scaled by
> batch volume; `grist.beer_srm` here shows the Lovibond↔SRM unit bridge instead.

---

## 3. A relation (n-ary invariant)

```jsonc
{ "id": "hlt_not_overfilled",
  "predicate": { "op": "le",
                 "lhs": { "ref": "batch.hlt_starting_volume_l" },
                 "rhs": { "ref": "equipment.max_hlt_volume_l" } } }
```

No single node owns this — it relates a batch-level root to an equipment field —
so it lives in `relations`.

---

## 4. What this example demonstrates

- All **five node kinds** (root, collection, selection, derived, boundary).
- **Explicit edges** (`inputs` aliases), never inferred.
- A **boundary output** consumed as an ordinary value.
- A **selection** with a sparse **overlay**, resolved through a schema.
- **Functions** (shared equations) invoked by `call`.
- **Reductions** over a collection with a lambda binding.
- **Dimension-checked** arithmetic (`temperature + temperature_delta`).
- A **relation** invariant spanning two nodes.
