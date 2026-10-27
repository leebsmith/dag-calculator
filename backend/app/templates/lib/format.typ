// Value access and display formatting driven entirely by the bundle's own
// catalog metadata. Every accessor panics with the dotted path it was given, so
// a template mistake names a bundle path rather than a line number.

#import "bundle.typ": bundle, batch, state, catalog

#let path-panic(path, why) = panic("report path " + path + ": " + why)

// Required member access. `container` is a dict or array.
#let req(container, path) = {
  if type(container) == dictionary {
    if container.at(path, default: none) == none and path not in container {
      path-panic(path, "missing key")
    }
    container.at(path)
  } else { path-panic(path, "not a dictionary") }
}

// Optional member access: absence is a legitimate renderable state.
#let opt(container, path) = {
  if type(container) == dictionary { container.at(path, default: none) } else { none }
}

// A component field (`equipment.mash_dead_space_l`, `style.og_min`, or the
// two-segment `water.source.calcium_ca`) lives in `batch.identity`, not in the
// node valuation. Returns `none` when the namespace or field is absent.
#let identity-value(path) = {
  let parts = path.split(".")
  if parts.len() < 2 { return none }
  let namespace = if parts.at(0) == "water" and parts.len() > 2 and parts.at(1) == "source" {
    "water.source"
  } else {
    parts.at(0)
  }
  let container = opt(batch.identity, namespace)
  if container == none { return none }
  let rest = if namespace == "water.source" { parts.slice(2) } else { parts.slice(1) }
  let current = container
  while rest.len() > 0 {
    if type(current) != dictionary { return none }
    let key = rest.at(0)
    if key not in current { return none }
    current = current.at(key)
    rest = rest.slice(1)
  }
  current
}

// Non-panicking resolution: (found, value). The longest valuation prefix wins;
// the remaining suffix may be an array index or a flattened boundary output key
// (`cascade.v_strike` is one key, not two nested members).
#let lookup(path) = {
  let parts = path.split(".")
  let node-id = none
  let suffix = ()
  for i in range(1, parts.len() + 1) {
    let candidate = parts.slice(0, i).join(".")
    if candidate in state.valuation {
      node-id = candidate
      suffix = parts.slice(i)
    }
  }
  if node-id == none {
    let fallback = identity-value(path)
    if fallback != none { return (true, fallback) }
    return (false, none)
  }
  let current = state.valuation.at(node-id)
  let rest = suffix
  while rest.len() > 0 {
    if type(current) == array {
      let index = int(rest.at(0))
      if index < 0 or index >= current.len() { return (false, none) }
      current = current.at(index)
      rest = rest.slice(1)
    } else if type(current) == dictionary {
      let i = rest.len()
      let matched = false
      while i > 0 {
        let key = rest.slice(0, i).join(".")
        if key in current {
          current = current.at(key)
          rest = rest.slice(i)
          matched = true
          break
        }
        i -= 1
      }
      if not matched { return (false, none) }
    } else {
      return (false, none)
    }
  }
  (true, current)
}

// Required value lookup. Identity paths fall back to `batch.identity`.
#let value(path) = {
  let found = lookup(path)
  if not found.at(0) {
    path-panic(path, "no node in state.valuation or batch.identity")
  }
  found.at(1)
}

#let node(path) = {
  if path not in catalog.nodes { path-panic(path, "missing catalog entry") }
  catalog.nodes.at(path)
}

// True only when the full path resolves — an output map that exists without the
// key a section reads is absent, not zero.
#let present-value(path) = {
  let found = lookup(path)
  found.at(0) and found.at(1) != none
}

// Fixed-decimal text. `decimals: none` matches the frontend's formatValue:
// integers verbatim, everything else trimmed to three decimal places.
#let fixed(number, decimals) = {
  if decimals == none {
    if number == calc.trunc(number) { return str(int(number)) }
    return str(calc.round(number * 1000) / 1000)
  }
  if decimals <= 0 { return str(int(calc.round(number))) }
  let scale = calc.pow(10.0, decimals)
  let text = str(calc.round(number * scale) / scale)
  let whole = text.split(".")
  let fraction = whole.at(1, default: "")
  if fraction.len() >= decimals { return text }
  whole.at(0) + "." + fraction + "0" * (decimals - fraction.len())
}

// Base unit -> display unit, mirroring engine/units.js fromBase. Nonlinear
// units need a named function that the bundle cannot carry; panicking beats
// silently printing the base value.
#let convert(number, dimension, unit, path: "") = {
  if dimension == none or unit == none { return number }
  let dim = bundle.artifact.content.dimensions.at(dimension, default: none)
  if dim == none { path-panic(path, "unknown dimension " + dimension) }
  if unit == dim.base_unit { return number }
  let entry = dim.units.at(unit, default: none)
  if entry == none { path-panic(path, "unknown unit " + unit + " for " + dimension) }
  let kind = dim.at("kind", default: "identity")
  if kind == "linear" { return number / entry.factor }
  if kind == "affine" { return number * entry.factor + entry.offset }
  if kind == "nonlinear" {
    path-panic(path, "nonlinear unit " + unit + " has no Typst function")
  }
  number
}

#let format-value(number, dimension, unit, decimals, symbol, path: "") = {
  if number == none { return "—" }
  if type(number) != int and type(number) != float { return str(number) }
  let shown = convert(number, dimension, unit, path: path)
  let text = fixed(shown, decimals)
  if symbol == none or symbol == "" { return text }
  // Tight units: the frontend joins "%" without a space (utils/format.js).
  if symbol == "%" { return text + symbol }
  text + " " + symbol
}

#let display(path) = {
  let entry = node(path)
  format-value(
    value(path),
    entry.at("dimension", default: none),
    entry.at("unit", default: none),
    entry.at("decimals", default: none),
    entry.at("symbol", default: none),
    path: path
  )
}

// The same conversion and rounding as `display`, without the unit symbol. Use
// when the unit is a separate column (accounting tables align the numbers).
#let display-number(path) = {
  let entry = node(path)
  format-value(
    value(path),
    entry.at("dimension", default: none),
    entry.at("unit", default: none),
    entry.at("decimals", default: none),
    none,
    path: path
  )
}

#let option-label(path, raw) = {
  let labels = node(path).at("option_labels", default: none)
  if labels == none { return str(raw) }
  labels.at(str(raw), default: str(raw))
}
