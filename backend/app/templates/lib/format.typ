// Value access and display formatting driven entirely by the bundle's own
// catalog metadata. Every accessor panics with the dotted path it was given, so
// a template mistake names a bundle path rather than a line number.

#import "bundle.typ": bundle, state, catalog

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

// The longest node-id prefix of `path` that the valuation holds, then the
// remaining suffix walks into a boundary output map, selection, or row.
#let value(path) = {
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
  if node-id == none { path-panic(path, "no node in state.valuation") }
  let current = state.valuation.at(node-id)
  for part in suffix {
    if type(current) == array {
      let index = int(part)
      if index < 0 or index >= current.len() { path-panic(path, "row index out of range") }
      current = current.at(index)
    } else if type(current) == dictionary {
      if part not in current { path-panic(path, "missing output key") }
      current = current.at(part)
    } else {
      path-panic(path, "cannot descend into a scalar")
    }
  }
  current
}

#let node(path) = {
  if path not in catalog.nodes { path-panic(path, "missing catalog entry") }
  catalog.nodes.at(path)
}

#let present-value(path) = {
  let parts = path.split(".")
  let node-id = none
  for i in range(1, parts.len() + 1) {
    let candidate = parts.slice(0, i).join(".")
    if candidate in state.valuation { node-id = candidate }
  }
  node-id != none
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

#let option-label(path, raw) = {
  let labels = node(path).at("option_labels", default: none)
  if labels == none { return str(raw) }
  labels.at(str(raw), default: str(raw))
}
