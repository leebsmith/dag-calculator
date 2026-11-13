// Fermentation strategy: free-form pitch and schedule notes the model does not
// calculate. Every cell is the bundle's frozen display string; this section
// only arranges it.

#import "../lib/format.typ": formatted-table, present-formatted-table
#import "../lib/prose.typ": prose-cell

#let COLLECTION = "report.fermentation_strategy"

#let present-fermentation-strategy() = present-formatted-table(COLLECTION)

#let render-fermentation-strategy() = {
  let rows = formatted-table(COLLECTION)
  if rows.len() == 0 { return }
  for row in rows {
    prose-cell(row.at("text"))
  }
}
