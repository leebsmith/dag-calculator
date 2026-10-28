// Batch facts: the sealed identity names and the realized batch results. Every
// figure is the bundle's frozen display string; this section does no conversion.

#import "../lib/format.typ": formatted-summary, formatted-table, formatted-text, present-formatted, present-formatted-summary, present-formatted-table

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

// One fermentable table: amounts, names, PPG, colour, then the percentage
// columns the caller names (major: authored share + grist share; trace: trace
// share + grist share; sugars: grist share only). Everything is a frozen
// display string; only the column layout lives here.
#let fermentable-table(
  collection,
  name-header: [Fermentable],
  pct-columns: (),
) = {
  let rows = formatted-table(collection)
  if rows.len() == 0 { return }
  let color-unit = rows.at(0).at("color").at("unit", default: "")
  let columns = (
    ([Amount], "amount"),
    (name-header, "name"),
    ([PPG], "ppg"),
    ([#color-unit], "color"),
  ) + pct-columns
  table(
    columns: (auto,) * columns.len(),
    align: (right, left, right, right) + (right,) * pct-columns.len(),
    stroke: none,
    inset: (x: 3pt, y: 2pt),
    table.header(..columns.map(column => column.at(0))),
    ..rows
      .map(row => columns.map(column => row.at(column.at(1)).at("text")))
      .flatten(),
  )
}

// The producer's mass-weighted colour and extract yield for one table (or the
// overall aggregate). Both are frozen strings, like every other figure.
#let summary-line(key) = {
  let summary = formatted-summary(key)
  if summary == none { return }
  let cell-text(name) = {
    let cell = summary.at(name, default: none)
    if cell == none { "—" } else { cell.at("text") }
  }
  text(size: 8pt, fill: rgb("#6b6b6b"))[
    Weighted color: #cell-text("color") · Weighted extract yield: #cell-text("extract_yield")
  ]
}

#let trace-note = text(size: 8pt, fill: rgb("#6b6b6b"))[
  Trace malts are colour and mash-pH additions; their PPG and weighted yield are
  reference only.
]

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
    *Pre-boil:* #formatted-text("solver.batch.cascade.sg_pre_boil"),
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
    fermentable-table(
      "grist.major_malts",
      pct-columns: (([Major %], "own_pct"), ([Grist %], "grist_pct")),
    )
    v(2pt)
    summary-line("grist.major_malts")
  }

  if present-formatted-table("grist.trace_malts") {
    v(4pt)
    heading(level: 2)[Trace Malts]
    fermentable-table(
      "grist.trace_malts",
      pct-columns: (([Trace %], "own_pct"), ([Grist %], "grist_pct")),
    )
    v(2pt)
    summary-line("grist.trace_malts")
    v(2pt)
    trace-note
  }

  if present-formatted-table("batch.sugars") {
    v(4pt)
    heading(level: 2)[Sugars & Syrups]
    fermentable-table(
      "batch.sugars",
      name-header: [Sugar],
      pct-columns: (([Grist %], "grist_pct"),),
    )
    v(2pt)
    summary-line("batch.sugars")
    v(2pt)
    text(size: 8pt, fill: rgb("#6b6b6b"))[
      Grist % is a share of grist mass (major + trace), not of extract, so the
      sugar line sits outside the grist's 100 %.
    ]
  }

  if present-formatted-summary("overall") {
    v(4pt)
    heading(level: 2)[Overall Fermentables]
    summary-line("overall")
    v(2pt)
    text(size: 8pt, fill: rgb("#6b6b6b"))[
      Color covers every fermentable; extract yield covers the grain bill and the
      sugars. Trace malts contribute no extract.
    ]
  }
}
