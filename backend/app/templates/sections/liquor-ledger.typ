// Liquor Ledger: hot liquor from the HLT fill to the second underlet, in process
// order. The arithmetic is the solver's; the section only lays it out.

#import "../lib/format.typ": formatted-number, formatted-text, formatted-unit, present-formatted

// The HLT budget is the section: without a solved cascade there is no ledger.
#let present-liquor-ledger() = present-formatted("solver.batch.hlt.v_hlt_debt")

#let text-or(path) = if present-formatted(path) { formatted-text(path) } else { "—" }

#let cell(body, bold: false) = if bold { text(weight: "bold")[#body] } else { body }

// Parentheses live inside the figure cell, and positives reserve the same width
// with hidden glyphs, so the column keeps one right edge (as in the volume ledger).
#let figure(text, subtract: false) = if subtract {
  [(#text)]
} else {
  [#hide("(")#text#hide(")")]
}

#let row(label, path, subtract: false, bold: false) = {
  let value = if present-formatted(path) { formatted-number(path) } else { "—" }
  let unit = if present-formatted(path) { formatted-unit(path) } else { none }
  (
    cell(label, bold: bold),
    cell(figure(value, subtract: subtract), bold: bold),
    if unit == none { "" } else { unit },
  )
}

#let render-liquor-ledger() = {
  let fill-label = [HLT fill (heated to #text-or("mash.strike_water_temp_c"))]
  let top-up-label = [Top-up (cold) to #text-or("solver.batch.hlt.v_hlt_target")]
  let second-label = [Second underlet (target #text-or("batch.sparge_water_temp_c"))]

  table(
    columns: (1fr, auto, auto),
    align: (left, right, left),
    stroke: none,
    inset: (x: 3pt, y: 3pt),
    ..row(fill-label, "batch.hlt_starting_volume_l"),
    ..row([First underlet], "solver.batch.cascade.v_strike", subtract: true),
    ..row([HLT after strike], "solver.batch.hlt.v_hlt_after_strike", bold: true),
    ..row(top-up-label, "solver.batch.hlt.v_hlt_top_up"),
    ..row([HLT debt], "solver.batch.hlt.v_hlt_debt", subtract: true),
    ..row(second-label, "solver.batch.hlt.v_sparge_deliverable", bold: true),
    ..row([Surplus], "batch.surplus_sparge_capacity"),
  )
  v(6pt)
  text(size: 8pt, fill: rgb("#6b6b6b"))[
    The top-up is cold water, so the second underlet's temperature is a target,
    not a prediction: heating and cooling are not modelled. Surplus is liquor
    deliverable beyond the sparge demand.
  ]
}
