// Batch facts: the sealed identity names and the realized batch results. Every
// figure is the bundle's frozen display string; this section does no conversion.

#import "../lib/format.typ": formatted-text, present-formatted

#let RESULT_PATHS = (
  "solver.batch.sg_post_boil",
  "batch.realized_fg",
  "solver.batch.apparent_attenuation",
  "batch.realized_abv",
  "batch.target_ibu",
  "grist.finished_beer_srm",
)

// A realized batch is required: without the solved facts the section is absent
// rather than a row of dashes.
#let present-batch-facts() = RESULT_PATHS.fold(
  true,
  (present, path) => present and present-formatted(path),
)

#let fact-text(path) = if present-formatted(path) { formatted-text(path) } else { "—" }

#let first-fact(paths) = {
  for path in paths {
    if present-formatted(path) { return formatted-text(path) }
  }
  "—"
}

#let render-batch-facts() = {
  heading(level: 2)[Batch Basics]
  [
    - *Equipment:* #fact-text("equipment.name")
    - *Water Source:* #first-fact((
        "water.source.source_name",
        "water.source.laboratory",
        "water.source.report_id",
      ))
    - *Style:* #fact-text("style.name")
  ]
  v(4pt)
  heading(level: 2)[Batch Results]
  [
    *OG:* #formatted-text("solver.batch.sg_post_boil"),
    *FG:* #formatted-text("batch.realized_fg"),
    *AA%:* #formatted-text("solver.batch.apparent_attenuation"),
    *ABV%:* #formatted-text("batch.realized_abv"),
    *IBU:* #formatted-text("batch.target_ibu"),
    *SRM:* #formatted-text("grist.finished_beer_srm")
  ]
}
