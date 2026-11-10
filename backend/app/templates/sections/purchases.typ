// Purchases: the shopping list. Every quantity is the buy amount, not the brew
// amount — grain and sugars are rounded up to the next whole ounce and printed
// in pounds and ounces; hops already carry the same whole-ounce rule.

#import "../lib/format.typ": cell-text, formatted-table, present-formatted-table

#let present-grain-purchases() = present-formatted-table("report.grain_purchases")
#let present-hop-purchases() = present-formatted-table("report.hop_purchases")
#let present-purchases() = present-grain-purchases() or present-hop-purchases()

#let purchase-table(collection, columns) = {
  let rows = formatted-table(collection)
  if rows.len() == 0 { return }
  table(
    columns: (auto,) * columns.len(),
    align: columns.map(column => column.at(2)),
    stroke: none,
    inset: (x: 3pt, y: 2pt),
    table.header(..columns.map(column => column.at(0))),
    ..rows
      .map(row => columns.map(column => cell-text(row.at(column.at(1)))))
      .flatten(),
  )
}

#let grain-columns = (
  ([Fermentable], "name", left),
  ([Kind], "kind", left),
  ([Buy], "buy", right),
)

#let hop-columns = (
  ([Hop], "name", left),
  ([Form], "form", left),
  ([Buy], "purchase", right),
)

#let note(body) = text(size: 8pt, fill: rgb("#6b6b6b"), body)

#let render-purchases() = {
  if present-formatted-table("report.grain_purchases") {
    block(breakable: false, {
      heading(level: 2)[Fermentables]
      purchase-table("report.grain_purchases", grain-columns)
      v(2pt)
      note[
        Rounded up to the next whole ounce; a malt split across the bill and the
        trace additions is one line. Brew quantities are in the batch facts.
      ]
    })
  }

  if present-formatted-table("report.hop_purchases") {
    v(4pt)
    block(breakable: false, {
      heading(level: 2)[Hops]
      purchase-table("report.hop_purchases", hop-columns)
      v(2pt)
      note[Quantities include dry hops and are rounded up to the next whole ounce.]
    })
  }
}
