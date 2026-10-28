// Report entry point. Composition only: the bundle supplies facts, the theme
// supplies appearance, and the registry below supplies section order.

#import "theme.typ": document
#import "lib/bundle.typ": bundle, batch, catalog, is-frozen
#import "lib/format.typ": opt
#import "sections/brewhouse.typ": present-brewhouse, render-brewhouse
#import "sections/batch-facts.typ": present-batch-facts, render-batch-facts
#import "sections/yeast.typ": present-yeast, render-yeast
#import "sections/volume-ledger.typ": present-volume-ledger, render-volume-ledger
#import "sections/liquor-ledger.typ": present-liquor-ledger, render-liquor-ledger

// === registry:begin ===
// One line per section, in canonical render order. Each entry names a module in
// sections/ exporting `present()` and `render()`; both read the bundle through
// lib/bundle.typ and take no arguments.
//   (id: "…", title: "…", present: <fn>, render: <fn>),
#let sections = (
  (id: "brewhouse", title: "Brewhouse", present: present-brewhouse, render: render-brewhouse),
  (id: "batch-facts", title: "Batch Facts", present: present-batch-facts, render: render-batch-facts),
  (id: "yeast", title: "Yeast", present: present-yeast, render: render-yeast),
  (id: "volume-ledger", title: "Volume Ledger", present: present-volume-ledger, render: render-volume-ledger),
  (id: "liquor-ledger", title: "Liquor Ledger", present: present-liquor-ledger, render: render-liquor-ledger),
)
// === registry:end ===

#let render-key = sys.inputs.at("render-key", default: none)
#let token = if render-key != none {
  render-key.slice(0, 8)
} else {
  bundle.content_hash.slice(7, 15)
}

// Paper is a view choice. `auto` follows the batch's display units: two of the
// three markers (volume, mass, temperature) must be US customary for US Letter.
#let unit-of(path) = if path in catalog.nodes {
  catalog.nodes.at(path).at("unit", default: none)
} else { none }

#let us-markers = (
  unit-of("batch.v_ferm") in ("gal", "qt"),
  unit-of("solver.batch.m_grist") in ("lb", "oz"),
  unit-of("mash.strike_water_temp_c") == "degF",
)

#let paper-input = sys.inputs.at("paper", default: "auto")
#let paper = if paper-input == "auto" or paper-input == "" {
  if us-markers.filter(marker => marker).len() >= 2 { "us-letter" } else { "a4" }
} else if paper-input == "a4" {
  "a4"
} else if paper-input == "letter" {
  "us-letter"
} else {
  panic("report spec: unknown paper " + paper-input + " (auto, a4, letter)")
}

// The spec: `sections` is a comma-separated subset (absent means all). The
// selection is a view — it never reaches the bundle and cannot reorder the
// registry.
#let wanted = sys.inputs.at("sections", default: "")
#let requested(id) = wanted == "" or wanted.split(",").contains(id)
#let included = sections.filter(section => requested(section.id) and (section.present)())
#let standalone = included.len() == 1

#show: rest => document(batch: batch, token: token, paper: paper, rest)

#let identity = batch.identity
#let identity-name(namespace, fallback-key) = {
  let entry = opt(identity, namespace)
  if entry == none { return none }
  entry.at("name", default: entry.at(fallback-key, default: none))
}

#let freeze-date = if is-frozen {
  (datetime(day: 1, month: 1, year: 1970) + duration(seconds: int(batch.frozen_at)))
    .display("[day] [month repr:short] [year]")
} else {
  none
}

#let meta-parts = (
  if is-frozen { "Frozen " + freeze-date } else { "Draft preview" },
)

// A single-section sheet suppresses the document chrome: it is a page to carry,
// not a report to read.
#if not standalone {
  block(below: 12pt, {
    set align(left)
    text(size: 20pt, weight: "bold", batch.name)
    v(3pt)
    text(size: 9pt, fill: rgb("#6b6b6b"))[Brew report · #meta-parts.join(" · ")]
  })

  let rows = (
    ("Equipment", identity-name("equipment", "name")),
    ("Water source", identity-name("water.source", "source_name")),
    ("Style", identity-name("style", "name")),
    ("Batch", batch.id),
  )
  let present-rows = rows.filter(row => row.at(1) != none)
  if present-rows.len() > 0 {
    grid(
      columns: (60pt, 1fr, 60pt, 1fr),
      column-gutter: 8pt,
      row-gutter: 2pt,
      ..present-rows
        .map(row => (text(fill: rgb("#6b6b6b"), row.at(0)), str(row.at(1))))
        .flatten(),
    )
  }

  v(10pt)
  line(length: 100%, stroke: 0.6pt + rgb("#b9b1a4"))
}

// Registry order is canonical: filter preserves it, so the spec selects a
// subset but cannot reorder. A section is a reading unit: keep it on one page
// when it fits, rather than splitting a table across a page break.
#for section in included {
  block(breakable: false, {
    heading(level: 1, section.title)
    (section.render)()
  })
}

#if sections.len() == 0 {
  v(10pt)
  text(fill: rgb("#8a8a8a"), style: "italic")[
    No sections are registered yet. The document chrome, identity block, and
    ancestry footer render from a downloaded bundle; sections land one at a time.
  ]
}
