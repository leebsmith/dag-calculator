// Water Chemistry: the source report, the selected objective, the ion ledger
// from source to the treated mash, and the solver's findings. Every figure is
// the bundle's frozen display string; this section only arranges them.

#import "../lib/format.typ": boundary-telemetry, formatted-number, formatted-text, present-formatted

#let ion-rows = (
  (label: "Calcium", source: "water.source.calcium_ca", objective: "water.target.calcium_ca", adjustment: "water.mash_adjustment.calcium_ca", final: "solver.water.post_dose_mash_ions.calcium_ca"),
  (label: "Magnesium", source: "water.source.magnesium_mg", objective: "water.target.magnesium_mg", adjustment: "water.mash_adjustment.magnesium_mg", final: "solver.water.post_dose_mash_ions.magnesium_mg"),
  (label: "Sodium", source: "water.source.sodium_na", objective: "water.target.sodium_na", adjustment: "water.mash_adjustment.sodium_na", final: "solver.water.post_dose_mash_ions.sodium_na"),
  (label: "Sulfate", source: "water.source.sulfate_so4", objective: "water.target.sulfate_so4", adjustment: "water.mash_adjustment.sulfate_so4", final: "solver.water.post_dose_mash_ions.sulfate_so4"),
  (label: "Chloride", source: "water.source.chloride_cl", objective: "water.target.chloride_cl", adjustment: "water.mash_adjustment.chloride_cl", final: "solver.water.post_dose_mash_ions.chloride_cl"),
  (label: "Alkalinity (as CaCO₃)", source: "water.source.total_alkalinity_caco3", objective: "water.target.alkalinity_as_caco3", adjustment: "water.mash_adjustment.alkalinity_as_caco3", final: "solver.water.post_dose_mash_ions.alkalinity_as_caco3"),
)

// The treated mash is the section: without a solved water boundary there is no
// final vector to print.
#let present-water-chemistry() = present-formatted("solver.water.post_dose_mash_ions.calcium_ca")

#let text-or(path) = if present-formatted(path) { formatted-text(path) } else { none }

#let number-or(path) = if present-formatted(path) {
  let value = formatted-number(path)
  if value == none { "—" } else { value }
} else {
  "—"
}

// A delta reads better with an explicit sign; the figure itself stays frozen.
#let signed-or(path) = {
  let value = number-or(path)
  if value == "—" or value.starts-with("-") { value } else { "+" + value }
}

#let first-text(paths) = {
  for path in paths {
    if present-formatted(path) {
      let value = formatted-text(path)
      if value != "" { return value }
    }
  }
  none
}

#let join-parts(parts) = parts.filter(part => part != none).join(" · ")

#let source-identification() = {
  let name = first-text((
    "water.source.source_name",
    "water.source.laboratory",
    "water.source.report_id",
  ))
  if name == none { return "—" }
  let laboratory = text-or("water.source.laboratory")
  let report = text-or("water.source.report_id")
  let details = (
    if laboratory != none and laboratory != name { laboratory } else { none },
    if report != none and report != "" { "report " + report } else { none },
  )
  let detail = join-parts(details)
  if detail == "" { name } else { name + " · " + detail }
}

#let objective-line() = {
  let profile = first-text(("water.target_profile.name", "water.target_profile_id"))
  let strategy = text-or("solver.water.strategy")
  if profile != none {
    if strategy != none { profile + " — " + strategy } else { profile }
  } else if strategy != none {
    strategy + " (no target profile)"
  } else {
    "No target profile"
  }
}

#let predicted-ph() = {
  let ph = text-or("solver.water.prescription.predicted_mash_ph")
  if ph == none { return none }
  let status = text-or("solver.water.prescription.mash_ph_status")
  if status == none { ph } else { ph + " · " + status }
}

#let water-events() = boundary-telemetry("solver.water")

// Severity is the reading order: problems first, then the decision log.
#let ordered-events() = {
  let events = water-events()
  let order = ("ERROR", "WARNING", "NOTE", "INFO")
  order
    .map(severity => events.filter(event => event.at("severity", default: "INFO") == severity))
    .flatten()
}

#let event-line(event) = {
  let severity = event.at("severity", default: "INFO")
  let color = if severity == "ERROR" or severity == "WARNING" {
    rgb("#9a3b1b")
  } else {
    rgb("#6b6b6b")
  }
  text(size: 8pt, fill: color)[
    #text(weight: "bold")[#severity] #event.at("message", default: "")
  ]
}

#let identity-row(label, value) = (
  text(fill: rgb("#6b6b6b"), label),
  value,
)

#let render-water-chemistry() = block(breakable: false, {
  let ph = predicted-ph()
  let facts = (
    identity-row("Source", source-identification()),
    identity-row("Objective", objective-line()),
  )
  if ph != none {
    facts = facts + (identity-row("Predicted mash pH", ph),)
  }
  grid(
    columns: (auto, 1fr),
    column-gutter: 8pt,
    row-gutter: 2pt,
    ..facts.flatten(),
  )

  v(6pt)
  table(
    columns: (auto, auto, auto, auto, auto),
    align: (left, right, right, right, right),
    stroke: none,
    inset: (x: 3pt, y: 2pt),
    table.header(
      [Ion],
      [Source (PPM)],
      [Objective (PPM)],
      [Adjustment (PPM)],
      [Final Water (PPM)],
    ),
    ..ion-rows
      .map(row => (
        row.label,
        number-or(row.source),
        number-or(row.objective),
        signed-or(row.adjustment),
        number-or(row.final),
      ))
      .flatten(),
  )
  v(2pt)
  text(size: 8pt, fill: rgb("#6b6b6b"))[
    Source is the batch's water report, Objective the selected target vector,
    and Final Water the treated mash. Adjustment is the net source-to-final
    change; concentrations are ppm by mass.
  ]

  let events = ordered-events()
  if events.len() > 0 {
    v(4pt)
    heading(level: 3)[Solver Findings]
    for event in events {
      event-line(event)
      linebreak()
    }
  }
})
