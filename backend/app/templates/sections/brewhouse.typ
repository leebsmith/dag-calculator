// Brewhouse: the process inputs that produce the batch's numbers. Every figure
// is the bundle's frozen display string; this section only arranges them.

#import "../lib/format.typ": formatted-text, present-formatted

// The process inputs are defaulted roots. Keying presence off the conversion
// efficiency gives the fixture an absent case without judging any value.
#let present-brewhouse() = present-formatted("batch.conversion_efficiency")

#let text-or(path) = if present-formatted(path) { formatted-text(path) } else { "—" }

#let rows = (
  ("Target ABV", "batch.target_abv"),
  ("Topology", "batch.topology"),
  ("Conversion efficiency", "batch.conversion_efficiency"),
  ("Brewhouse efficiency", "solver.batch.brewhouse_efficiency"),
  ("Mash thickness", "batch.mash_thickness_l_per_kg"),
  ("Runoff ratio", "batch.runoff_ratio"),
  ("Boil time", "batch.boil_time_min"),
  ("Boil-off rate", "batch.boil_off_rate_l_per_hr"),
  ("Grain moisture", "batch.grain_moisture_fraction"),
)

#let render-brewhouse() = {
  table(
    columns: (1fr, auto),
    align: (left, right),
    stroke: none,
    inset: (x: 3pt, y: 4pt),
    ..rows.map(row => (row.at(0), text-or(row.at(1)))).flatten(),
  )
  v(6pt)
  text(size: 8pt, fill: rgb("#6b6b6b"))[
    Conversion efficiency is mash recovery alone; brewhouse efficiency is malt
    extract into the fermenter over the grist's potential, so it also carries
    lauter and kettle losses. Late additions are excluded from both sides of the
    brewhouse figure.
  ]
}
