// Volume ledger: strike water down to the cold fermenter, including the
// dissolved late addition. Reads the frozen solve; never recomputes.

#import "../lib/format.typ": display-number, node, present-value

#let rows = (
  (label: "Strike water", path: "solver.batch.cascade.v_strike"),
  (label: "Grain moisture (per malt, backfilled)", path: "solver.batch.cascade.v_mc"),
  (label: "Dissolved extract", path: "solver.batch.cascade.v_sol"),
  (label: "Grain absorption", path: "solver.batch.cascade.v_absorption", subtract: true),
  (label: "Mash dead space", path: "equipment.mash_dead_space_l", subtract: true),
  (label: "First runnings", path: "solver.batch.cascade.v_run1", bold: true),
  (label: "Sparge water", path: "solver.batch.cascade.v_sparge"),
  (label: "Second runnings", path: "solver.batch.cascade.v_run2", bold: true),
  (label: "Mash transfer loss", path: "equipment.mash_transfer_loss_l", subtract: true),
  (label: "Pre-boil kettle", path: "solver.batch.v_pre_boil", bold: true),
  (label: "Boil-off", path: "batch.delta_v_evap", subtract: true),
  (label: "Post-boil (wort, hot)", path: "solver.batch.cascade.v_post_boil", bold: true),
  (label: "Late-addition volume", path: "batch.late_addition_volume_l"),
  (label: "Shrinkage", path: "batch.shrinkage_volume_l", subtract: true),
  (label: "Kettle dead space", path: "equipment.kettle_dead_space_l", subtract: true),
  (label: "Kettle transfer", path: "equipment.kettle_transfer_loss_l", subtract: true),
  (label: "Trub", path: "equipment.trub_loss_l", subtract: true),
  (label: "Fermenter (cold)", path: "batch.v_ferm", bold: true),
)

// The cascade exists only after a solve, and the loss rows read the sealed
// equipment identity. Either missing means the ledger has no fact to print.
#let present-volume-ledger() = (
  present-value("solver.batch.cascade.v_strike")
    and present-value("equipment.mash_dead_space_l")
)

#let cell(body, bold: false) = if bold { text(weight: "bold")[#body] } else { body }

// Parentheses live inside the figure cell, and positives reserve the same width
// with hidden glyphs. Every figure therefore has the same right edge, so the
// decimals align while the brackets hug each number.
#let figure(text, subtract: false) = if subtract {
  [(#text)]
} else {
  [#hide("(")#text#hide(")")]
}

#let ledger-row(row) = {
  let subtract = row.at("subtract", default: false)
  let bold = row.at("bold", default: false)
  (
    cell(row.label, bold: bold),
    cell(figure(display-number(row.path), subtract: subtract), bold: bold),
    node(row.path).at("symbol", default: ""),
  )
}

#let render-volume-ledger() = {
  text(size: 9pt, fill: rgb("#6b6b6b"))[
    Water and wort volume from strike to the cold fermenter. Parentheses mark
    subtractions; the chain closes on the fermenter target.
  ]
  v(4pt)
  table(
    columns: (1fr, auto, auto),
    align: (left, right, left),
    stroke: none,
    inset: (x: 3pt, y: 2pt),
    ..rows.map(ledger-row).flatten(),
  )
}
