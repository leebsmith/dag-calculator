// Mash rests: the enabled schedule in canonical order. The total includes the
// ramp between rests; the table rows are rest durations only.

#import "../lib/format.typ": formatted-table, formatted-text, present-formatted, present-formatted-table

#let COLLECTION = "mash.rests"

#let present-mash-rests() = present-formatted-table(COLLECTION)

#let columns = (
  ([Step], "name", left),
  ([Temperature], "temp", right),
  ([Time], "time", right),
)

#let render-mash-rests() = block(breakable: false, {
  let rows = formatted-table(COLLECTION)
  if present-formatted("mash.total_time_min") {
    text(size: 9pt, fill: rgb("#6b6b6b"))[
      Enabled rests · #formatted-text("mash.total_time_min") total
    ]
    v(4pt)
  }
  table(
    columns: (1fr, auto, auto),
    align: columns.map(column => column.at(2)),
    stroke: none,
    inset: (x: 3pt, y: 2pt),
    table.header(..columns.map(column => column.at(0))),
    ..rows
      .map(row => columns.map(column => row.at(column.at(1)).at("text")))
      .flatten(),
  )
  v(2pt)
  text(size: 8pt, fill: rgb("#6b6b6b"))[
    Enabled rests in schedule order. The total includes ramp time between rests.
  ]
})
