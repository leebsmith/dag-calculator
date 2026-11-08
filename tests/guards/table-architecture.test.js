import test from "node:test";
import assert from "node:assert/strict";
import { read, rel, walk } from "./util.js";

// Fixed tables are the strict part of the table contract: they must declare a
// column group (so the fixed layout has a stable track definition) and they
// must sit inside a panel that cannot scroll horizontally. A fixed table in an
// overflow-x:auto panel silently reintroduces the horizontal scroll the malt
// editor is meant to forbid.

const PARTIALS = () => walk("frontend/src/partials", [".html"]);

function openingTags(text) {
  const tags = [];
  let i = 0;
  let line = 1;

  while (i < text.length) {
    if (text[i] === "<" && /[a-zA-Z]/.test(text[i + 1] ?? "")) {
      let j = i + 1;
      let quote = null;

      while (j < text.length) {
        const c = text[j];
        if (quote) {
          if (c === "\\") j++;
          else if (c === quote) quote = null;
        } else if (c === '"' || c === "'") {
          quote = c;
        } else if (c === ">") {
          break;
        }
        j++;
      }

      const raw = text.slice(i + 1, j);
      const name = (raw.match(/^[a-zA-Z][\w-]*/) ?? [""])[0];
      const attrs = raw.slice(name.length);
      const classAttr = (attrs.match(/\bclass="([^"]*)"/) ?? [])[1] ?? "";
      const styleAttr = (attrs.match(/\bstyle="([^"]*)"/) ?? [])[1] ?? "";

      tags.push({ name, classAttr, styleAttr, start: i, line });
      i = j;
    }

    if (text[i] === "\n") line++;
    i++;
  }

  return tags;
}

function nearestContainer(tags, tableStart) {
  for (let i = tags.length - 1; i >= 0; i--) {
    const tag = tags[i];
    if (tag.start >= tableStart) continue;
    if (tag.name === "div" && tag.classAttr.includes("data-table-container")) return tag;
  }
  return null;
}

function nonScrolling(container) {
  const classes = container.classAttr.split(/\s+/);
  if (classes.includes("data-table-container--fit")) return true;
  if (classes.includes("data-table-container--scroll")) return true;
  return /overflow(-x)?:\s*hidden\b/.test(container.styleAttr);
}

test("fixed tables declare a colgroup and sit in a non-scrolling panel", () => {
  const failures = [];

  for (const abs of PARTIALS()) {
    const file = rel(abs);
    const text = read(file);
    const tags = openingTags(text);

    for (const table of tags) {
      if (table.name !== "table") continue;
      if (!table.classAttr.includes("data-table--fixed")) continue;

      const close = text.indexOf("</table>", table.start);
      if (close === -1) {
        failures.push(`${file}:${table.line}: fixed table has no closing tag`);
        continue;
      }

      const inner = text.slice(table.start, close);
      const colCount = (inner.match(/<col\b/g) ?? []).length;
      const head = inner.slice(0, inner.indexOf("</thead>") + 1);
      const headCount = (head.match(/<th\b/g) ?? []).length;

      if (!inner.includes("<colgroup") || colCount === 0) {
        failures.push(`${file}:${table.line}: fixed table has no colgroup`);
      } else if (headCount > 0 && colCount !== headCount) {
        failures.push(
          `${file}:${table.line}: fixed table has ${colCount} col(s) for ${headCount} header(s)`
        );
      }

      const container = nearestContainer(tags, table.start);
      if (!container) {
        failures.push(`${file}:${table.line}: fixed table has no data-table-container`);
        continue;
      }

      if (/overflow(-x)?:\s*auto\b/.test(container.styleAttr)) {
        failures.push(
          `${file}:${table.line}: fixed table sits in an overflow-x:auto container`
        );
      } else if (!nonScrolling(container)) {
        failures.push(
          `${file}:${table.line}: fixed table container is not --fit or --scroll`
        );
      }
    }
  }

  assert.deepEqual(failures, [], failures.join("\n"));
});

test("the generic table renders a colgroup and fit panel for fixed configs", () => {
  const text = read("frontend/src/partials/ui-data-table.html");

  assert.match(text, /<colgroup>/, "ui-data-table must emit a colgroup");
  assert.match(text, /<col\b/, "ui-data-table colgroup must contain a col");
  assert.match(
    text,
    /data-table-container--fit/,
    "ui-data-table must bind the fit container for fixed configs"
  );
  assert.match(
    text,
    /data-table--fixed/,
    "ui-data-table must bind the fixed table variant"
  );
});
