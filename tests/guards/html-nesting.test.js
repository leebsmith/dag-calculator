// HTML nesting guard: tag balance and content models across the app shell and
// every partial. Alpine templates are transparent, because an x-if/x-for body is
// inserted at the template's parent, so that parent's content model is what the
// browser enforces. <load> targets are resolved one level: a loaded block root
// may not sit inside a phrasing parent.

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";

import { ROOT, read, rel, walk } from "./util.js";

const FILES = ["frontend/index.html", ...walk("frontend/src/partials", [".html"]).map(rel)];
const PARTIALS = "frontend/src/partials";

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
const BLOCK = new Set([
  "address", "article", "aside", "blockquote", "details", "dialog", "div", "dl", "fieldset",
  "figcaption", "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "header",
  "hgroup", "hr", "main", "nav", "ol", "p", "pre", "section", "table", "ul",
]);
const INTERACTIVE = new Set(["a", "button", "input", "select", "textarea", "details", "audio", "video", "iframe", "object", "embed"]);
const LABELABLE = new Set(["button", "input", "select", "textarea", "meter", "output", "progress"]);
const PHRASING_PARENTS = new Set(["p", "span", "button", "summary", "h1", "h2", "h3", "h4", "h5", "h6", "legend", "dt"]);
const TABLE_CHILDREN = new Set(["caption", "colgroup", "thead", "tbody", "tfoot", "tr", "script", "template"]);
const SECTION_CHILDREN = new Set(["tr", "script", "template"]);
const UL_CHILDREN = new Set(["li", "script", "template"]);
const DL_CHILDREN = new Set(["dt", "dd", "div", "script", "template"]);
const SELECT_CHILDREN = new Set(["option", "optgroup", "hr", "script", "template"]);
const IMPLIED = new Set(["li", "dt", "dd", "p", "option", "tr", "td", "th", "thead", "tbody", "tfoot"]);

function parseAttrs(raw) {
  const attrs = {};
  for (const match of raw.matchAll(/([:@]?[\w:.-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
    attrs[match[1]] = match[2] ?? match[3] ?? match[4] ?? "";
  }
  return attrs;
}

function* tags(text) {
  let i = 0;
  while (i < text.length) {
    const lt = text.indexOf("<", i);
    if (lt < 0) return;
    if (text.startsWith("<!--", lt)) {
      const end = text.indexOf("-->", lt + 4);
      i = end < 0 ? text.length : end + 3;
      continue;
    }
    if (text[lt + 1] === "!" || text[lt + 1] === "?") {
      const end = text.indexOf(">", lt);
      i = end < 0 ? text.length : end + 1;
      continue;
    }
    const head = /^<\/?([A-Za-z][\w:-]*)/.exec(text.slice(lt, lt + 80));
    if (!head) {
      i = lt + 1;
      continue;
    }
    const closing = text[lt + 1] === "/";
    let j = lt + (closing ? 2 : 1) + head[1].length;
    let quote = null;
    for (; j < text.length; j += 1) {
      const c = text[j];
      if (quote) {
        if (c === quote) quote = null;
        continue;
      }
      if (c === '"' || c === "'") quote = c;
      else if (c === ">") break;
    }
    const selfClosing = text[j - 1] === "/";
    const attrs = parseAttrs(text.slice(locAfterName(text, lt, closing, head[1].length), j - (selfClosing ? 1 : 0)));
    yield { name: head[1].toLowerCase(), closing, selfClosing, attrs, index: lt };
    i = j + 1;
  }
}

function locAfterName(text, lt, closing, nameLength) {
  return lt + (closing ? 2 : 1) + nameLength;
}


function audit(file, text, { loadsOf } = {}) {
  const issues = [];
  const stack = [];
  const ids = [];
  const loads = [];
  let lastIndex = 0;
  let line = 1;

  const add = (severity, message) => issues.push(`${severity} ${file}:${line}: ${message}`);
  const effective = () => {
    for (let i = stack.length - 1; i >= 0; i -= 1) {
      if (stack[i].tag !== "template") return stack[i];
    }
    return null;
  };
  const popTo = (tag) => {
    for (let i = stack.length - 1; i >= 0; i -= 1) {
      if (stack[i].tag !== tag) continue;
      const between = stack.slice(i + 1).filter((entry) => entry.tag !== "template").map((entry) => `<${entry.tag}>`);
      if (between.length) add("error", `</${tag}> closes while ${between.join(", ")} still open`);
      stack.length = i;
      return true;
    }
    return false;
  };

  for (const token of tags(text)) {
    line += (text.slice(lastIndex, token.index).match(/\n/g) ?? []).length;
    lastIndex = token.index;
    const { name, closing, selfClosing, attrs } = token;

    if (closing) {
      if (VOID.has(name)) {
        add("warn", `</${name}> closes a void element`);
        continue;
      }
      if (stack.length && stack[stack.length - 1].tag === name) stack.pop();
      else if (!popTo(name)) add("error", `stray </${name}>`);
      continue;
    }

    if (attrs.id && !attrs[":id"]) ids.push(name === "template" ? null : attrs.id);
    if (attrs.src && name === "load") loads.push({ src: attrs.src, line, parent: effective()?.tag ?? null });

    if (!selfClosing && !VOID.has(name)) {
      if (IMPLIED.has(name) && stack.length && stack[stack.length - 1].tag === name) stack.pop();
      if (name === "td" || name === "th") {
        if (stack.length && ["td", "th"].includes(stack[stack.length - 1].tag)) stack.pop();
      }
      if (name === "tr" && stack.length && ["td", "th", "tr"].includes(stack[stack.length - 1].tag)) {
        while (stack.length && ["td", "th", "tr"].includes(stack[stack.length - 1].tag)) stack.pop();
      }
      if (["thead", "tbody", "tfoot"].includes(name) && stack.length && ["thead", "tbody", "tfoot"].includes(stack[stack.length - 1].tag)) {
        stack.pop();
      }
    }

    const parent = effective();
    if (parent) {
      const pt = parent.tag;
      parent.children[name] = (parent.children[name] ?? 0) + 1;
      if (pt === "label") {
        if (["button", "a", "details"].includes(name)) add("error", `<${name}> inside <label> (interactive child)`);
        if (LABELABLE.has(name)) {
          parent.labelable = (parent.labelable ?? 0) + 1;
          if (parent.labelable > 1) add("error", `second labelable <${name}> inside one <label>`);
        }
      } else if (PHRASING_PARENTS.has(pt) && BLOCK.has(name)) {
        add("error", `<${name}> inside <${pt}> (block in phrasing)`);
      }
      if (["button", "summary"].includes(pt) && INTERACTIVE.has(name)) {
        add("error", `<${name}> inside <${pt}> (nested interactive)`);
      }
      if (pt === "a" && ["a", "button"].includes(name)) add("error", `<${name}> inside <a>`);
      if (pt === "form" && name === "form") add("error", "<form> inside <form>");
      if (["ul", "ol"].includes(pt) && !UL_CHILDREN.has(name) && name !== "template") {
        add("error", `<${name}> as a child of <${pt}>`);
      }
      if (pt === "dl" && !DL_CHILDREN.has(name) && name !== "template") add("error", `<${name}> as a child of <dl>`);
      if (pt === "table" && !TABLE_CHILDREN.has(name) && name !== "template") add("error", `<${name}> as a child of <table>`);
      if (pt === "tr" && !["td", "th", "script", "template"].includes(name)) add("error", `<${name}> as a child of <tr>`);
      if (["thead", "tbody", "tfoot"].includes(pt) && !SECTION_CHILDREN.has(name) && name !== "template") {
        add("error", `<${name}> as a child of <${pt}>`);
      }
      if (pt === "select" && !SELECT_CHILDREN.has(name) && name !== "template") add("error", `<${name}> as a child of <select>`);
      if (pt === "details" && !Object.keys(parent.children).length && name !== "summary") {
        add("warn", `<details> first child is <${name}>, not <summary>`);
      }
    }

    if (selfClosing || VOID.has(name)) continue;
    stack.push({ tag: name, children: {}, labelable: 0 });
  }

  for (const entry of stack) {
    if (entry.tag !== "template") add("error", `unclosed <${entry.tag}>`);
  }
  const seen = new Set();
  for (const id of ids.filter(Boolean)) {
    if (seen.has(id)) add("error", `duplicate static id "${id}"`);
    seen.add(id);
  }
  if (loadsOf) for (const load of loads) loadsOf(load, add);
  return issues;
}

function rootTag(src) {
  const target = path.join(ROOT, PARTIALS, path.basename(src));
  if (!existsSync(target)) return null;
  const match = /<([A-Za-z][\w-]*)/.exec(read(path.join(PARTIALS, path.basename(src))).replace(/<!--[\s\S]*?-->/g, ""));
  return match ? match[1].toLowerCase() : null;
}

function check(file) {
  return audit(file, read(file), {
    loadsOf(load, add) {
      const root = rootTag(load.src);
      if (root === null) {
        add("error", `load target missing: ${load.src}`);
        return;
      }
      if (load.parent && PHRASING_PARENTS.has(load.parent) && BLOCK.has(root)) {
        add("error", `load of <${root}> inside <${load.parent}>`);
      }
    },
  });
}

test("every partial and the shell nest correctly", () => {
  const issues = FILES.flatMap(check);
  assert.deepEqual(issues, [], issues.join("\n"));
});

test("a button inside a label fails", () => {
  assert.deepEqual(
    audit("fixture.html", '<label for="f"><button type="button">unit</button></label>'),
    ['error fixture.html:1: <button> inside <label> (interactive child)']
  );
});

test("a block inside a paragraph fails", () => {
  assert.deepEqual(audit("fixture.html", '<p><div>block</div></p>'), [
    "error fixture.html:1: <div> inside <p> (block in phrasing)",
  ]);
});

test("an unbalanced section fails", () => {
  assert.deepEqual(audit("fixture.html", "<section><div></section>"), [
    "error fixture.html:1: </section> closes while <div> still open",
  ]);
});

test("a template body is checked against the template's parent", () => {
  assert.deepEqual(audit("fixture.html", "<p><template x-if=\"ok\"><div>block</div></template></p>"), [
    "error fixture.html:1: <div> inside <p> (block in phrasing)",
  ]);
});
