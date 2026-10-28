// Yeast: the selected strain and the attenuation ceiling it implies. Every
// figure is the bundle's frozen display string; this section only arranges them.

#import "../lib/bundle.typ": state
#import "../lib/format.typ": formatted-number, formatted-text, formatted-unit, present-formatted

// The strain is the section: without a selected yeast there is nothing to print.
#let present-yeast() = present-formatted("batch.yeast.name")

#let text-or(path) = if present-formatted(path) { formatted-text(path) } else { "—" }

#let part(path) = if present-formatted(path) { formatted-text(path) } else { none }

// "SafAle US-05 · Fermentis · Dry · Ale" — a segment drops when the bundle has
// no value for it, so a strain without a manufacturer still reads cleanly.
#let header-line() = {
  let parts = (
    part("batch.yeast.name"),
    part("batch.yeast.manufacturer"),
    part("batch.yeast.form"),
    part("batch.fermentation"),
  ).filter(entry => entry != none)
  parts.join(" · ")
}

// STA1 is a tri-state in the state: positive, negative, or unknown. It reads as a
// compact suffix on the strain line and still gates the warning below.
#let sta1-status() = {
  let yeast = state.valuation.at("batch.yeast", default: none)
  if type(yeast) != dictionary { return none }
  let sta1 = yeast.at("sta1", default: none)
  if sta1 == true { "STA1+" } else if sta1 == false { "STA1−" } else { "STA1?" }
}

// "15.0–22.0 °C · Medium flocculation · STA1+". The bundle has no range entry:
// the dash and the shared unit are the one join this section performs.
#let temperature-line() = {
  let low = "batch.yeast.temp_low_c"
  let high = "batch.yeast.temp_high_c"
  let range = if present-formatted(low) and present-formatted(high) {
    formatted-number(low) + "–" + formatted-number(high) + " " + formatted-unit(low)
  } else if present-formatted(low) {
    formatted-text(low)
  } else {
    none
  }
  let flocculation = if present-formatted("batch.yeast.flocculation") {
    formatted-text("batch.yeast.flocculation") + " flocculation"
  } else {
    none
  }
  (range, flocculation, sta1-status()).filter(entry => entry != none).join(" · ")
}

#let derate-points() = state.valuation.at("batch.attenuation_derate_points", default: 0)

// A zero derate is the default, so the subtraction row is only worth printing
// when it actually moves the ceiling.
#let presents-derate() = derate-points() > 0

// STA1 is a boolean in the state, not a display string: it gates a warning
// rather than printing a cell.
#let diastaticus() = {
  let yeast = state.valuation.at("batch.yeast", default: none)
  if type(yeast) != dictionary { return false }
  yeast.at("sta1", default: none) == true
}

// The grist sets its own ceiling when it ferments below the yeast's cap: the
// solver clamps malt fermentability one-sided, so a less fermentable grist
// lands under the cap with nothing else explaining it. The row prints only when
// the grist is the binding constraint (the same presence-comparison idiom as the
// derate row); the figure itself is a frozen string.
#let grist-attenuation() = {
  let solver = state.valuation.at("solver.batch", default: none)
  if type(solver) != dictionary { return none }
  solver.at("grist_attenuation", default: none)
}

#let grist-below-cap() = {
  let grist = grist-attenuation()
  let cap = state.valuation.at("batch.yeast_cap", default: none)
  if grist == none or cap == none { false } else { grist < cap }
}

#let below-cap-rows() = if grist-below-cap() {
  (
    [Grist attenuation],
    text-or("solver.batch.grist_attenuation"),
  )
} else { () }

// The blend can exceed the malt cap: sugar extract is never capped, and a
// diastaticus strain consumes the malt's dextrin residue. The producer omits
// the value when nothing exceeds the cap, so the row disappears rather than
// printing "+0.0 pts".
#let above-cap-rows() = if present-formatted("batch.attenuation_above_cap") {
  (
    [Above malt cap],
    "+ " + formatted-text("batch.attenuation_above_cap"),
  )
} else { () }

// The chain is one derivation: published attenuation, less the batch derate,
// clamped to the malt ceiling. A zero derate collapses it to the ceiling alone,
// so a report never prints a subtraction of nothing.
#let attenuation-chain() = {
  let with-derate = presents-derate()
  // Cell strokes rather than hlines: a row rule spans the pair, the hairline
  // marks only the value column.
  let sep = (bottom: 0.6pt + rgb("#b9b1a4"))
  let hair = (top: 0.4pt + rgb("#c9c2b6"))
  let head = if with-derate {
    (
      [Typical attenuation],
      text-or("batch.yeast.attenuation_pct"),
      table.cell(stroke: sep)[Batch derate],
      table.cell(stroke: sep, "− " + text-or("batch.attenuation_derate_points")),
      [Malt attenuation cap],
      text-or("batch.yeast_cap"),
    )
  } else {
    (
      [Typical attenuation = cap],
      text-or("batch.yeast.attenuation_pct"),
    )
  }
  let realized = (
    text(fill: rgb("#4a4a4a"))[Realized (Batch Facts)],
    table.cell(
      stroke: hair,
      inset: (x: 0pt, y: 4pt, top: 8pt),
      text(fill: rgb("#4a4a4a"), text-or("solver.batch.apparent_attenuation")),
    ),
  )
  let rows = head + below-cap-rows() + above-cap-rows() + realized

  grid(
    columns: (1fr, auto),
    column-gutter: 12pt,
    [*Attenuation ceiling*],
    text(size: 8pt, fill: rgb("#6b6b6b"))[apparent],
  )
  // This table has no header row, so the theme's bold first row does not apply.
  show table.cell.where(y: 0): set text(weight: "regular")
  table(
    columns: (1fr, auto),
    align: (left, right),
    stroke: none,
    inset: (x: 0pt, y: 4pt),
    ..rows,
  )
}

#let render-yeast() = block(breakable: false, {
  text(size: 11pt, weight: "medium", header-line())
  v(2pt)
  text(size: 9pt, fill: rgb("#4a4a4a"), temperature-line())
  v(8pt)
  attenuation-chain()

  if diastaticus() {
    v(8pt)
    block(
      width: 100%,
      fill: rgb("#fbf3e6"),
      inset: (x: 7pt, y: 5pt),
      stroke: (left: 2pt + rgb("#b8823a")),
      text(size: 8.5pt)[
        *⚠ STA1 positive — diastaticus.* Dedicate cold-side equipment and allow
        extended conditioning.
      ],
    )
  }
})
