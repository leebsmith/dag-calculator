// Limits: the solver's feasibility ceiling and the solved extract masses. Every
// figure is the bundle's frozen display string; this section only arranges them.

#import "../lib/format.typ": formatted-text, present-formatted

// The feasibility bound is the section: without a solved capacity ceiling there
// is nothing to report.
#let present-limits() = present-formatted("solver.batch.max_feasible_abv")

#let text-or(path) = if present-formatted(path) { formatted-text(path) } else { "—" }

#let feasibility-rows = (
  ("Max feasible ABV", "solver.batch.max_feasible_abv"),
  ("Binding limit", "solver.batch.binding_constraint"),
  ("Attenuation ceiling", "solver.batch.max_achievable_abv"),
)

#let extract-rows = (
  ("Grist mass", "solver.batch.m_grist"),
  ("Post-boil extract", "solver.batch.s_post_boil_target"),
  ("First runnings extract", "solver.batch.cascade.s_run1"),
  ("Second runnings extract", "solver.batch.cascade.s_run2"),
)

#let row-table(rows) = table(
  columns: (1fr, auto),
  align: (left, right),
  stroke: none,
  inset: (x: 3pt, y: 4pt),
  ..rows.map(row => (row.at(0), text-or(row.at(1)))).flatten(),
)

#let render-limits() = {
  block(breakable: false, {
    heading(level: 2)[Feasibility]
    row-table(feasibility-rows)
    v(4pt)
    text(size: 8pt, fill: rgb("#6b6b6b"))[
      Max feasible ABV is the largest target that both solves and fits the rig;
      the attenuation ceiling is the fermentation limit alone. The binding limit
      names the capacity that sets the feasible figure.
    ]
  })

  v(4pt)
  block(breakable: false, {
    heading(level: 2)[Solved Extract]
    row-table(extract-rows)
    v(4pt)
    text(size: 8pt, fill: rgb("#6b6b6b"))[
      Post-boil extract is the sugar mass the batch must hold; the runnings split
      it between the first and second runoff.
    ]
  })
}
