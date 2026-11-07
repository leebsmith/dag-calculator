// Hops: the three charges — boil, whirlpool, dry — then the IBU splits and the
// roll-up. Every figure is the bundle's frozen display string; this section only
// arranges them.

#import "../lib/format.typ": formatted-table, formatted-text, present-formatted, present-formatted-table

#let BOIL = "batch.boil_hops"
#let WHIRLPOOL = "batch.whirlpool_hops"
#let DRY = "batch.dry_hops"

// Boil and whirlpool are solved; dry hops are descriptive and add no IBU, so the
// section exists when the batch has any charge at all.
#let present-strategy() = present-formatted-table("report.hop_strategy")

#let present-hops() = (
  present-formatted-table(BOIL)
  or present-formatted-table(WHIRLPOOL)
  or present-formatted-table(DRY)
  or present-strategy()
)

#let present-purchases() = present-formatted-table("report.hop_purchases")

#let text-or(path) = if present-formatted(path) { formatted-text(path) } else { "—" }

#let note(body) = text(size: 8pt, fill: rgb("#6b6b6b"), body)

// One hop table: a frozen display string per cell, and only the column layout
// lives here. Each column is (header, row key, alignment).
#let hop-table(collection, columns) = {
  let rows = formatted-table(collection)
  if rows.len() == 0 { return }
  table(
    columns: (auto,) * columns.len(),
    align: columns.map(column => column.at(2)),
    stroke: none,
    inset: (x: 3pt, y: 2pt),
    table.header(..columns.map(column => column.at(0))),
    ..rows
      .map(row => columns.map(column => row.at(column.at(1)).at("text")))
      .flatten(),
  )
}

#let boil-columns = (
  ([Hop], "name", left),
  ([Form], "form", left),
  ([Alpha], "alpha", right),
  ([Boil], "boil", right),
  ([Share], "ibu_share", right),
  ([IBU], "ibu", right),
  ([Amount], "amount", right),
)

#let whirlpool-columns = (
  ([Hop], "name", left),
  ([Form], "form", left),
  ([Alpha], "alpha", right),
  ([After flameout], "add", right),
  ([Temp], "temp", right),
  ([Share], "ibu_share", right),
  ([IBU], "ibu", right),
  ([Amount], "amount", right),
)

#let dry-columns = (
  ([Hop], "name", left),
  ([Type], "type", left),
  ([Qty], "quantity", right),
  ([Unit], "unit", right),
  ([Applied at], "applied", left),
  ([Contact], "contact", left),
  ([Detail], "detail", left),
)

#let purchase-columns = (
  ([Hop], "name", left),
  ([Form], "form", left),
  ([Buy], "purchase", right),
)

#let render-hops() = {
  if present-strategy() {
    block(breakable: false, {
      heading(level: 2)[Hopping Strategy]
      for row in formatted-table("report.hop_strategy") {
        par(row.at("text").at("text"))
      }
    })
  }

  if present-formatted-table(BOIL) {
    block(breakable: false, {
      heading(level: 2)[Boil Hops]
      hop-table(BOIL, boil-columns)
      v(2pt)
      note[
        Alpha demanded: #text-or("solver.hops.boil_alpha_mass_kg") for #text-or("batch.boil_target_ibu")
      ]
      v(1pt)
      note[
        Boil IBU: #text-or("batch.boil_target_ibu") · Boil hop mass: #text-or("solver.hops.boil_mass_kg")
      ]
      v(2pt)
      note[
        Masses are the product to weigh, solved from each charge's alpha and form.
        The catalog alpha is a stock preset: replace it with the lot certificate.
      ]
    })
  }

  if present-formatted-table(WHIRLPOOL) {
    v(4pt)
    block(breakable: false, {
      heading(level: 2)[Whirlpool Hops]
      hop-table(WHIRLPOOL, whirlpool-columns)
      v(2pt)
      note[
        Whirlpool IBU: #text-or("batch.whirlpool_target_ibu") · Whirlpool hop mass: #text-or("solver.hops.whirlpool_mass_kg")
      ]
      note[
        Alpha demanded: #text-or("solver.hops.whirlpool_alpha_mass_kg")
      ]
      v(2pt)
      note[
        Additions count from flameout; knockout closes the window from
        #text-or("batch.whirlpool_start_temp_c") at the batch's
        #text-or("batch.whirlpool_cooling_time_constant_min") time constant toward
        #text-or("batch.whirlpool_ambient_temp_c") ambient. A charge colder than that
        curve implies an inferred chill; a warmer one is refused.
      ]
    })
  }

  if present-formatted-table(DRY) {
    v(4pt)
    block(breakable: false, {
      heading(level: 2)[Dry Hops]
      hop-table(DRY, dry-columns)
      v(2pt)
      note[
        Applied in fermentation. The event and the contact record the intent; there
        is no fermentation model behind them. Dry hops add no IBU and sit outside
        the totals below.
      ]
    })
  }

  if present-formatted("batch.boil_ibu_share") and present-formatted-table(WHIRLPOOL) {
    v(4pt)
    block(breakable: false, {
      heading(level: 2)[IBU Splits]
      heading(level: 3)[Boil / Whirlpool]
      [
        - *Boil:* #text-or("batch.boil_ibu_share") (#text-or("batch.boil_target_ibu"))
        - *Whirlpool:* #text-or("batch.whirlpool_ibu_share") (#text-or("batch.whirlpool_target_ibu"))
      ]
      if present-formatted("batch.whirlpool_hot_ibu_share") {
        v(4pt)
        heading(level: 3)[Whirlpool Hot / Cool]
        // The cut is ISOMERIZATION_FLOOR_C in backend/app/core/hop_solver.py.
        [
          - *Hot (above the floor, > 79 °C):* #text-or("batch.whirlpool_hot_ibu_share") (#text-or("solver.hops.whirlpool_hot_ibu"))
          - *Cool (at or below it):* #text-or("batch.whirlpool_cool_ibu_share") (#text-or("solver.hops.whirlpool_cool_ibu"))
        ]
      }
    })
  }

  v(4pt)
  block(breakable: false, {
    heading(level: 2)[Overall Hops]
    note[
      Total IBU (boil + whirlpool): #text-or("batch.target_ibu") · Total hop mass: #text-or("solver.hops.total_mass_kg")
    ]
    v(2pt)
    note[The totals cover the boil and the whirlpool; dry hops are excluded.]
  })

  if present-formatted-table("report.hop_purchases") {
    v(4pt)
    block(breakable: false, {
      heading(level: 2)[Hop Purchases]
      hop-table("report.hop_purchases", purchase-columns)
      v(2pt)
      note[
        Quantities include dry hops and are rounded up to the next whole ounce.
      ]
    })
  }
}
