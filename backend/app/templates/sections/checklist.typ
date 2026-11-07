// Checklist: the flat frozen table carries step rows and observation rows,
// grouped by phase and section. Every cell is a frozen display string.

#import "../lib/bundle.typ": display-tables, display-values

#let COLLECTION = "batch.brew_checklist"

#let cell(row, key) = {
  let value = row.at(key, default: none)
  if value == none or type(value) != dictionary {
    "—"
  } else {
    value.at("text", default: "—")
  }
}

#let all-rows = display-tables.at(COLLECTION, default: ())
#let rows = all-rows.filter(row => cell(row, "skipped") == "—")

#let present-checklist() = rows.len() > 0

#let level = if "batch.checklist_level" in display-values {
  display-values.at("batch.checklist_level").text
} else {
  "Standard"
}

#let step-row(row) = block(breakable: false, {
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

#let observation-table(observations) = table(
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

#let render-checklist() = {
  text(size: 8pt, fill: rgb("#6b6b6b"))[Checklist level: #level]
  let phases = ()
  for row in rows {
    let name = cell(row, "phase")
    if not phases.contains(name) { phases.push(name) }
  }

  for phase in phases {
    heading(level: 2)[#phase]
    let phase-rows = rows.filter(row => cell(row, "phase") == phase)
    let sections = ()
    for row in phase-rows {
      let name = cell(row, "section")
      if not sections.contains(name) { sections.push(name) }
    }

    for section in sections {
      heading(level: 3)[#section]
      let section-rows = phase-rows.filter(row => cell(row, "section") == section)
      let steps = section-rows.filter(row => cell(row, "kind") == "step")
      let observations = section-rows.filter(row => cell(row, "kind") == "observation")

      for row in steps {
        step-row(row)
      }

      if observations.len() > 0 {
        observation-table(observations)
      }
    }
  }
}
