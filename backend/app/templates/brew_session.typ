// Brew Sheet: the execution log beside a frozen recipe. The session document
// supplies every fact; this template only arranges it.

#let session = json(sys.inputs.at("session", default: "/session.json"))
#let paper = sys.inputs.at("paper", default: "a4")

#set document(title: session.batch_name, author: "dag-calculator")
#set page(
  paper: if paper == "letter" { "us-letter" } else { "a4" },
  margin: (x: 18mm, y: 18mm),
)
#set text(size: 10pt)

#let rows = session.plan_snapshot.table

#let cell(row, key) = {
  let value = row.at(key, default: none)
  if value == none { "" } else { value.at("text", default: "") }
}

#let date-label(seconds) = if seconds == none {
  "—"
} else {
  (datetime(day: 1, month: 1, year: 1970) + duration(seconds: int(seconds)))
    .display("[year]-[month]-[day] [hour]:[minute]")
}

#let step-state(id) = session.steps.at(id, default: (:))

#let latest-observation(metric) = {
  let found = session.observations.filter(observation =>
    observation.metric_id == metric and observation.void == false
  )
  if found.len() == 0 { none } else { found.last() }
}

#let raw-label(observation) = if observation == none {
  "—"
} else {
  str(observation.raw.value) + " " + observation.raw.unit
}

#let corrected-label(observation) = if observation == none or observation.corrected == none {
  "—"
} else {
  str(observation.corrected.value) + " " + observation.corrected.unit
}

#let phase-names = ()
#for row in rows {
  let name = cell(row, "phase")
  if name not in phase-names { phase-names.push(name) }
}

#let section-names(phase) = {
  let names = ()
  for row in rows.filter(row => cell(row, "phase") == phase) {
    let name = cell(row, "section")
    if name not in names { names.push(name) }
  }
  names
}

#text(size: 20pt, weight: "bold", session.batch_name)
#v(2pt)
#text(
  size: 9pt,
  fill: rgb("#6b6b6b"),
  "Brew session · " + session.level + " · " + session.status,
)
#v(1pt)
#text(
  size: 9pt,
  fill: rgb("#6b6b6b"),
  "Started " + date-label(session.started_at) + " · Frozen " + date-label(session.frozen_at),
)
#v(8pt)
#line(length: 100%, stroke: 0.6pt + rgb("#b9b1a4"))

#for phase in phase-names {
  heading(level: 2)[#phase]
  for section in section-names(phase) {
    heading(level: 3)[#section]
    let section-rows = rows.filter(row =>
      cell(row, "phase") == phase and cell(row, "section") == section
    )

    for row in section-rows.filter(row => cell(row, "kind") == "step") {
      let id = cell(row, "step_id")
      let state = step-state(id)
      let mark = if state.at("done", default: false) { "[x]" } else { "[ ]" }
      block(breakable: false, {
        text(weight: "bold", mark + " " + cell(row, "title"))
        linebreak()
        cell(row, "text")
        if state.at("note", default: "") != "" {
          linebreak()
          text(size: 8.5pt, fill: rgb("#6b6b6b"), "Note: " + state.note)
        }
        if state.at("skipped", default: false) {
          linebreak()
          text(
            size: 8.5pt,
            fill: rgb("#b8823a"),
            "Skipped" + if state.at("skip_reason", default: "") == "" {
              ""
            } else {
              ": " + state.skip_reason
            },
          )
        }
      })
      v(4pt)
    }

    let observations = section-rows.filter(row => cell(row, "kind") == "observation")
    if observations.len() > 0 {
      table(
        columns: (auto, auto, auto, auto, auto, auto, auto),
        align: (left, right, right, right, left, left, left),
        stroke: none,
        inset: (x: 3pt, y: 2pt),
        table.header(
          [Metric],
          [Expected],
          [Raw],
          [Corrected],
          [Unit],
          [Method],
          [Taken],
        ),
        ..observations.map(row => {
          let observation = latest-observation(cell(row, "metric_id"))
          (
            cell(row, "title"),
            cell(row, "expected"),
            raw-label(observation),
            corrected-label(observation),
            cell(row, "unit"),
            if observation == none { "—" } else { observation.method },
            if observation == none { "—" } else { date-label(observation.at) },
          )
        }).flatten(),
      )
    }
  }
}

#let observation-rows = rows.filter(row => cell(row, "kind") == "observation")
#if observation-rows.len() > 0 {
  heading(level: 1)[Variance]
  table(
    columns: (auto, auto, auto, auto),
    align: (left, right, right, right),
    stroke: none,
    inset: (x: 3pt, y: 2pt),
    table.header([Metric], [Expected], [Actual], [Delta]),
    ..observation-rows.map(row => {
      let observation = latest-observation(cell(row, "metric_id"))
      let expected = if cell(row, "expected_number") == "—" {
        none
      } else {
        float(cell(row, "expected_number"))
      }
      let actual = if observation == none {
        none
      } else if observation.corrected != none {
        observation.corrected.value
      } else {
        observation.raw.value
      }
      let delta = if expected == none or actual == none { "—" } else { str(calc.round(actual - expected, digits: 3)) }
      (
        cell(row, "title"),
        cell(row, "expected"),
        if actual == none { "not recorded" } else { str(actual) },
        delta,
      )
    }).flatten(),
  )
}

#if session.notes != "" {
  heading(level: 2)[Notes]
  session.notes
}
