// Markdown prose as typed content. The backend parses markdown into this AST;
// every string reaches Typst as data, never as generated markup.

#let prose-code(content, is-block: false, info: "") = {
  show raw: it => if it.block {
    block(
      fill: rgb(241, 245, 249),
      inset: 4pt,
      radius: 2pt,
      text(font: "IBM Plex Sans", it.text),
    )
  } else {
    box(
      fill: rgb(241, 245, 249),
      inset: (x: 2pt, y: 0pt),
      radius: 1pt,
      text(font: "IBM Plex Sans", it.text),
    )
  }
  if is-block {
    raw(content, block: true, lang: if info == "" { "text" } else { info })
  } else {
    raw(content)
  }
}

#let prose-node(node) = {
  let kind = node.at("type", default: "")
  if kind == "doc" {
    node.at("children", default: ()).map(prose-node).join()
  } else if kind == "paragraph" {
    par(node.at("children", default: ()).map(prose-node).join())
  } else if kind == "heading" {
    let level = node.at("level", default: 3)
    let size = if level == 1 { 12pt } else if level == 2 { 10.5pt } else { 9.8pt }
    block(above: 8pt, below: 3pt, text(
      size: size,
      weight: "bold",
      node.at("children", default: ()).map(prose-node).join(),
    ))
  } else if kind == "list" {
    let items = node.at("items", default: ()).map(item => item.map(prose-node).join())
    if node.at("ordered", default: false) {
      enum(start: node.at("start", default: 1), ..items)
    } else {
      list(..items)
    }
  } else if kind == "quote" {
    quote(block: true, node.at("children", default: ()).map(prose-node).join())
  } else if kind == "code" {
    prose-code(
      node.at("text", default: ""),
      is-block: node.at("block", default: false),
      info: node.at("info", default: ""),
    )
  } else if kind == "hr" {
    line(length: 100%, stroke: 0.6pt + rgb(185, 177, 164))
  } else if kind == "strong" {
    strong(node.at("children", default: ()).map(prose-node).join())
  } else if kind == "emph" {
    emph(node.at("children", default: ()).map(prose-node).join())
  } else if kind == "strike" {
    strike(node.at("children", default: ()).map(prose-node).join())
  } else if kind == "link" {
    link(
      node.at("href"),
      node.at("children", default: ()).map(prose-node).join(),
    )
  } else if kind == "break" {
    linebreak()
  } else if kind == "text" {
    node.at("value", default: "")
  } else {
    ""
  }
}

#let prose-cell(cell) = {
  if cell == none {
    ""
  } else {
    let blocks = cell.at("blocks", default: none)
    if blocks == none { cell.at("text", default: "") } else { prose-node(blocks) }
  }
}

#let prose-value(value, blocks: none) = if blocks == none {
  value
} else {
  prose-node(blocks)
}
