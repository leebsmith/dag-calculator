// Brewhouse: the process inputs that produce the batch's numbers. Every figure
// is the bundle's frozen display string; this section only arranges them.

#import "../lib/format.typ": formatted-text, present-formatted

// The process inputs are defaulted roots. Keying presence off the conversion
// efficiency gives the fixture an absent case without judging any value.
#let present-brewhouse() = present-formatted("batch.conversion_efficiency")

#let text-or(path) = if present-formatted(path) { formatted-text(path) } else { "—" }

// The constraint names the ratio the solve holds. Both ratios print as solved
// values, so a reader sees the actual L/kg and r whichever topology ran; the
// authored roots behind them are never printed. Exported for the render probes.
#let constraint-rows = (
  ("Constraint", "batch.topology"),
  ("Liquor-to-grist ratio", "solver.batch.mash_thickness_l_per_kg"),
  ("Runnings ratio (r)", "batch.runnings_ratio"),
)

#let rows = (
  ("Target ABV", "batch.target_abv"),
) + constraint-rows + (
  ("Conversion efficiency", "batch.conversion_efficiency"),
  ("Brewhouse efficiency", "solver.batch.brewhouse_efficiency"),
  ("Boil time", "batch.boil_time_min"),
  ("Boil-off rate", "batch.boil_off_rate_l_per_hr"),
  ("Grain moisture", "batch.grain_moisture_fraction"),
)

#let render-brewhouse() = block(breakable: false, {
  table(
    columns: (1fr, auto),
    align: (left, right),
    stroke: none,
    inset: (x: 3pt, y: 4pt),
    ..rows.map(row => (row.at(0), text-or(row.at(1)))).flatten(),
  )
  v(6pt)
  text(size: 8pt, fill: rgb("#6b6b6b"))[
    The constraint names the ratio the solve holds. Both ratios print as solved
    values: with the liquor-to-grist constraint the runnings ratio follows from
    the solved split, and with the runoff-ratio constraint the L/kg ratio is
    derived from the tun mass balance.
  ]
  v(4pt)
  text(size: 8pt, fill: rgb("#6b6b6b"))[
    Conversion efficiency is mash recovery alone; brewhouse efficiency is malt
    extract into the fermenter over the grist's potential, so it also carries
    lauter and kettle losses. Late additions are excluded from both sides of the
    brewhouse figure.
  ]
})
