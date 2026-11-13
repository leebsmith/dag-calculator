// Discussion: free-form recipe background the model does not calculate. Every
// cell is the bundle's frozen display string; this section only arranges it.

#import "../lib/format.typ": formatted-table, present-formatted-table
#import "../lib/prose.typ": prose-cell

#let COLLECTION = "report.discussion"

#let present-discussion() = present-formatted-table(COLLECTION)

#let render-discussion() = {
  let rows = formatted-table(COLLECTION)
  if rows.len() == 0 { return }
  for row in rows {
    prose-cell(row.at("text"))
  }
}
