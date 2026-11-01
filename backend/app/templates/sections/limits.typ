// Limits: the solver's feasibility ceiling and the extract ledger. Every figure
// is the bundle's frozen display string; this section only arranges them.

#import "../lib/format.typ": formatted-number, formatted-text, formatted-unit, present-formatted

// The feasibility bound is the section: without a solved capacity ceiling there
// is nothing to report.
#let present-limits() = present-formatted("solver.batch.max_feasible_abv")

// The ledger needs the head of the solved chain; a bundle from an unsolved batch
// has no extract figures to close.
#let present-extract-ledger() = present-formatted("solver.batch.extract.s_potential")

#let text-or(path) = if present-formatted(path) { formatted-text(path) } else { "—" }

#let feasibility-rows = (
  ("Max feasible ABV", "solver.batch.max_feasible_abv"),
  ("Binding limit", "solver.batch.binding_constraint"),
  ("Attenuation ceiling", "solver.batch.max_achievable_abv"),
)

// The extract chain from the grist's potential to the fermenter. `subtract` rows
// print in parentheses like the volume ledger; `bold` rows are the thresholds a
// reader can check the chain against.
#let extract-rows = (
  (label: "Potential extract (dry basis)", path: "solver.batch.extract.s_potential", bold: true),
  (label: "Conversion inefficiency", path: "batch.extract_loss_conversion", subtract: true),
  (label: "Converted extract", path: "solver.batch.extract.s_converted", bold: true),
  (label: "Mash tun and transfer losses", path: "batch.extract_loss_mash", subtract: true),
  (label: "Extract into the kettle", path: "solver.batch.extract.s_kettle", bold: true),
  (label: "Late additions", path: "batch.sugar_extract_total"),
  (label: "Post-boil extract", path: "solver.batch.s_post_boil_target", bold: true),
  (label: "Kettle losses", path: "batch.extract_loss_kettle", subtract: true),
  (label: "Extract into the fermenter", path: "solver.batch.extract.s_fermenter", bold: true),
)

#let row-table(rows) = table(
  columns: (1fr, auto),
  align: (left, right),
  stroke: none,
  inset: (x: 3pt, y: 4pt),
  ..rows.map(row => (row.at(0), text-or(row.at(1)))).flatten(),
)

#let cell(body, bold: false) = if bold { text(weight: "bold")[#body] } else { body }

// Parentheses live inside the figure cell, and positives reserve the same width
// with hidden glyphs, so every figure keeps one right edge.
#let figure(text, subtract: false) = if subtract {
  [(#text)]
} else {
  [#hide("(")#text#hide(")")]
}

#let ledger-row(row) = {
  let subtract = row.at("subtract", default: false)
  let bold = row.at("bold", default: false)
  let unit = formatted-unit(row.path)
  (
    cell(row.label, bold: bold),
    cell(figure(formatted-number(row.path), subtract: subtract), bold: bold),
    if unit == none { "" } else { unit },
  )
}

#let render-limits() = {
  block(breakable: false, {
    heading(level: 2)[Feasibility]
    row-table(feasibility-rows)
    v(4pt)
    text(size: 8pt, fill: rgb("#6b6b6b"))[
      Max feasible ABV is the largest target that both solves and fits the rig;
      the attenuation ceiling is the fermentation limit alone. The binding limit
      names the capacity that sets the feasible figure.
    ]
  })

  v(4pt)
  if present-extract-ledger() {
    block(breakable: false, {
      heading(level: 2)[Extract Ledger]
      text(size: 9pt, fill: rgb("#6b6b6b"))[
        Extract from the grist's potential to the cold fermenter. Parentheses
        mark subtractions; the chain closes on the fermenter figure.
      ]
      v(4pt)
      table(
        columns: (1fr, auto, auto),
        align: (left, right, left),
        stroke: none,
        inset: (x: 3pt, y: 2pt),
        ..extract-rows.map(ledger-row).flatten(),
      )
      v(2pt)
      row-table((("Brewhouse efficiency", "solver.batch.brewhouse_efficiency"),))
      v(4pt)
      text(size: 8pt, fill: rgb("#6b6b6b"))[
        Mash tun and transfer losses hold grain absorption and tun dead space
        (#formatted-text("batch.extract_loss_retention")) together with the hose
        and pump (#formatted-text("batch.extract_loss_transfer")). Kettle losses
        are the dead space, transfer and trub volumes, which carry wort at the
        post-boil concentration.
      ]
      v(4pt)
      text(size: 8pt, fill: rgb("#6b6b6b"))[
        Brewhouse efficiency is malt extract into the kettle over the grist's
        potential; late additions are excluded from both sides.
      ]
    })
  }
}
