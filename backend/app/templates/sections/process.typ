// Process notes: free-text additions and notes the model does not calculate.
// Every cell is the bundle's frozen display string; this section only arranges
// the rows.

#import "../lib/format.typ": formatted-table, present-formatted-table

#let COLLECTION = "batch.process_notes"

#let present-process() = present-formatted-table(COLLECTION)

#let render-process() = {
  let rows = formatted-table(COLLECTION)
  if rows.len() == 0 { return }
  table(
    columns: (1fr,),
    stroke: none,
    inset: (x: 3pt, y: 2pt),
    table.header([Note]),
    ..rows.map(row => row.at("note").at("text")),
  )
}
