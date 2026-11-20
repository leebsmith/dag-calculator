// Water objectives: the targets the dose had to satisfy. The Water Chemistry
// section prints every target; this section says which of them constrained the
// solver, so a held row and a floated row cannot be confused.

#import "../lib/bundle.typ": state
#import "../lib/format.typ": formatted-number, formatted-text, present-formatted

#let COLLECTION = "water.pinned_ions"

#let pinned-rows() = {
  let collections = state.at("collections", default: none)
  if collections == none { return () }
  let rows = collections.at(COLLECTION, default: none)
  if rows == none { return () }
  rows
}

#let present-water-objectives() = pinned-rows().len() > 0

#let ion-rows = (
  (pin: "ca", label: "Calcium", target: "water.target.calcium_ca"),
  (pin: "mg", label: "Magnesium", target: "water.target.magnesium_mg"),
  (pin: "na", label: "Sodium", target: "water.target.sodium_na"),
  (pin: "so4", label: "Sulfate", target: "water.target.sulfate_so4"),
  (pin: "cl", label: "Chloride", target: "water.target.chloride_cl"),
  (pin: "alk", label: "Alkalinity (as CaCO₃)", target: "water.target.alkalinity_as_caco3"),
)

#let objective-rows() = {
  let pins = pinned-rows().map(row => row.at("ion", default: ""))
  ion-rows.filter(row => row.pin in pins)
}

#let number-or(path) = if present-formatted(path) {
  let value = formatted-number(path)
  if value == none { "—" } else { value }
} else {
  "—"
}

#let route-label() = if present-formatted("solver.water.strategy") {
  formatted-text("solver.water.strategy")
} else {
  none
}

#let render-water-objectives() = block(breakable: false, {
  let route = route-label()
  if route != none {
    text(size: 9pt)[*Route* — #route]
    v(4pt)
  }
  table(
    columns: (1fr, auto),
    align: (left, right),
    stroke: none,
    inset: (x: 3pt, y: 2pt),
    table.header([Objective], [Target (PPM)]),
    ..objective-rows()
      .map(row => (row.label, number-or(row.target)))
      .flatten(),
  )
  v(2pt)
  text(size: 8pt, fill: rgb("#6b6b6b"))[
    Only these targets constrained the dose; every other ion floated to the
    source. Source-to-final figures are in Water Chemistry.
  ]
})
