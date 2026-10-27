// Page, type, and rule styling. Content structure lives in report.typ and
// sections/*.typ; appearance lives here.

#let footer(batch, token) = context [
  #set text(size: 7.5pt, fill: rgb("#6b6b6b"))
  #grid(
    columns: (1fr, auto),
    align: (left, right),
    [
      #{ if batch != none { batch.name } } #h(5pt)·#h(5pt) #{ token }
    ],
    counter(page).display("1 / 1"),
  )
]

#let document(batch: none, token: "", body) = {
  set page(
    paper: "a4",
    margin: (x: 19mm, top: 18mm, bottom: 21mm),
    footer: footer(batch, token),
  )
  set text(font: "Libertinus Serif", size: 9.5pt, fill: rgb("#1a1a1a"))
  set par(leading: 0.62em)
  set heading(numbering: none)

  show heading.where(level: 1): it => block(above: 14pt, below: 6pt, {
    set text(size: 13pt, weight: "bold")
    it.body
    v(2pt)
    line(length: 100%, stroke: 0.6pt + rgb("#b9b1a4"))
  })

  show heading.where(level: 2): it => block(above: 10pt, below: 4pt, {
    set text(size: 10.5pt, weight: "bold")
    it.body
  })

  set table(inset: (x: 4pt, y: 2.5pt), stroke: none)
  show table.cell.where(y: 0): set text(weight: "bold")

  body
}
