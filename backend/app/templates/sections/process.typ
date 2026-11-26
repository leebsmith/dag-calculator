// Process notes: free-text additions and notes the model does not calculate.
// Every cell is the bundle's frozen display string; this section only arranges
// the rows. Bundles frozen before process notes became a prose field carry the
// one-column collection instead, so both shapes render.

#import "../lib/format.typ": formatted-table, present-formatted-table
#import "../lib/prose.typ": prose-cell

#let TABLE = "report.process_notes"
#let LEGACY = "batch.process_notes"

#let present-process() = present-formatted-table(TABLE) or present-formatted-table(LEGACY)

#let render-process() = {
  let rows = formatted-table(TABLE)
  if rows.len() > 0 {
    for row in rows {
      prose-cell(row.at("text"))
    }
    return
  }
  let legacy = formatted-table(LEGACY)
  if legacy.len() == 0 { return }
  table(
    columns: (1fr,),
    stroke: none,
    inset: (x: 3pt, y: 2pt),
    table.header([Note]),
    ..legacy.map(row => prose-cell(row.at("note"))),
  )
}
