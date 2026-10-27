// Value access and display for the bundle. The generator is numerically dumb:
// every figure arrives pre-formatted from the bundle (`formatted`), so this
// module only looks paths up. No unit conversion, rounding, or symbol choice.

#import "bundle.typ": bundle, batch, state, catalog, display-values, display-tables

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

#let node(path) = {
  if path not in catalog.nodes { path-panic(path, "missing catalog entry") }
  catalog.nodes.at(path)
}

// The frozen display record: { text, number?, unit? }.
#let formatted(path) = {
  if path not in display-values { path-panic(path, "no formatted value") }
  display-values.at(path)
}

// True only when the producer emitted a display string for this path.
#let present-formatted(path) = path in display-values

// Per-row display cells for a collection table. Absent/empty means the block
// has no rows to print.
#let formatted-table(collection) = {
  if collection not in display-tables { return () }
  display-tables.at(collection)
}

#let present-formatted-table(collection) = formatted-table(collection).len() > 0

// The printed value, including the symbol ("12.4 °P", "75.6%").
#let formatted-text(path) = formatted(path).at("text")

// The figure without the symbol ("12.4"), for tables that align the number and
// the unit in separate columns.
#let formatted-number(path) = formatted(path).at("number", default: none)

// The display symbol ("°P", "%", "L"), or none.
#let formatted-unit(path) = formatted(path).at("unit", default: none)

#let option-label(path, raw) = {
  let labels = node(path).at("option_labels", default: none)
  if labels == none { return str(raw) }
  labels.at(str(raw), default: str(raw))
}
