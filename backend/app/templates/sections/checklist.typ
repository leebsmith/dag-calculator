// Checklist: the flat frozen table carries step rows and observation rows.
// Every cell is a frozen display string; this section only arranges them.

#import "../lib/bundle.typ": display-tables

#let COLLECTION = "batch.brew_day_steps"

#let rows = display-tables.at(COLLECTION, default: ())

#let present-checklist() = rows.len() > 0

#let cell(row, key) = {
  let value = row.at(key, default: none)
  if value == none or type(value) != dictionary {
    "—"
  } else {
    value.at("text", default: "—")
  }
}

#let render-checklist() = {
  let steps = rows.filter(row => cell(row, "kind") == "step")
  let observations = rows.filter(row => cell(row, "kind") == "observation")

  if steps.len() > 0 {
    heading(level: 2)[Steps]
    for row in steps {
      block(breakable: false, {
        grid(
          columns: (14pt, 1fr),
          column-gutter: 4pt,
          [#text("[ ]")],
          [
            #text(weight: "bold", cell(row, "title"))
            #linebreak()
            #cell(row, "text")
            #linebreak()
            #text(size: 8pt, fill: rgb("#6b6b6b"), "Level: " + cell(row, "level"))
          ],
        )
      })
    }
  }

  if observations.len() > 0 {
    heading(level: 2)[Observation Log]
    table(
      columns: (auto, auto, auto, auto, auto, auto),
      align: (left, right, right, right, left, left),
      stroke: none,
      inset: (x: 3pt, y: 2pt),
      table.header([Metric], [Expected], [Raw], [Corrected], [Unit], [Method]),
      ..observations
        .map(row => (
          cell(row, "title"),
          cell(row, "expected"),
          cell(row, "raw"),
          cell(row, "corrected"),
          cell(row, "unit"),
          cell(row, "method"),
        ))
        .flatten(),
    )
  }
}
