// Batch facts: the sealed identity names and the realized batch results. Every
// figure is the bundle's frozen display string; this section does no conversion.

#import "../lib/format.typ": formatted-table, formatted-text, present-formatted, present-formatted-table

#let RESULT_PATHS = (
  "solver.batch.sg_post_boil",
  "batch.realized_fg",
  "solver.batch.apparent_attenuation",
  "batch.realized_abv",
  "batch.target_ibu",
  "grist.finished_beer_srm",
)

// A realized batch is required: without the solved facts the section is absent
// rather than a row of dashes.
#let present-batch-facts() = RESULT_PATHS.fold(
  true,
  (present, path) => present and present-formatted(path),
)

#let fact-text(path) = if present-formatted(path) { formatted-text(path) } else { "—" }

#let first-fact(paths) = {
  for path in paths {
    if present-formatted(path) { return formatted-text(path) }
  }
  "—"
}

// One grist table: amounts, names, PPG, colour, and bill share. Everything is
// a frozen display string; only the column layout lives here.
#let grist-table(collection) = {
  let rows = formatted-table(collection)
  if rows.len() == 0 { return }
  let color-unit = rows.at(0).at("color").at("unit", default: "")
  table(
    columns: (auto, auto, auto, auto, auto),
    align: (right, left, right, right, right),
    stroke: none,
    inset: (x: 3pt, y: 2pt),
    table.header([Amount], [Fermentable], [PPG], [#color-unit], [Bill %]),
    ..rows
      .map(row => (
        row.at("amount").at("text"),
        row.at("name").at("text"),
        row.at("ppg").at("text"),
        row.at("color").at("text"),
        row.at("bill_pct").at("text"),
      ))
      .flatten(),
  )
}

#let render-batch-facts() = {
  heading(level: 2)[Batch Basics]
  [
    - *Equipment:* #fact-text("equipment.name")
    - *Water Source:* #first-fact((
        "water.source.source_name",
        "water.source.laboratory",
        "water.source.report_id",
      ))
    - *Style:* #fact-text("style.name")
  ]
  v(4pt)
  heading(level: 2)[Batch Solver Results]
  [
    *OG:* #formatted-text("solver.batch.sg_post_boil"),
    *FG:* #formatted-text("batch.realized_fg"),
    *AA%:* #formatted-text("solver.batch.apparent_attenuation"),
    *ABV%:* #formatted-text("batch.realized_abv"),
    *IBU:* #formatted-text("batch.target_ibu"),
    *SRM:* #formatted-text("grist.finished_beer_srm")
  ]

  if present-formatted-table("grist.major_malts") {
    v(4pt)
    heading(level: 2)[Major Grist Fermentables]
    grist-table("grist.major_malts")
  }

  if present-formatted-table("grist.trace_malts") {
    v(4pt)
    heading(level: 2)[Trace Malts]
    grist-table("grist.trace_malts")
    text(size: 8pt, fill: rgb("#6b6b6b"))[
      Trace malts are colour and mash-pH additions; their PPG is reference only.
    ]
  }
}
