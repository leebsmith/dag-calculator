// Numeric-input contract: an editable number must either be change-only or use
// the raw-text buffer so a re-render cannot rewrite the value mid-keystroke.
// New numeric inputs are the drift risk this guard exists to stop.

import test from "node:test";
import assert from "node:assert/strict";

import { read, rel, walk } from "./util.js";

const BUFFERED_HANDLERS = [
  "editNumberInput",
  "editCellInput",
  "editDraftCellInput",
  "editWaterNumber",
  "editWaterTargetInput",
  "librarySetField",
];

const BUFFERED_VALUES = ["inputDraft(", "libraryFieldDisplay("];

function inputTags(html) {
  const tags = [];
  let index = 0;
  while ((index = html.indexOf("<input", index)) !== -1) {
    let cursor = index + "<input".length;
    let quote = null;
    while (cursor < html.length) {
      const char = html[cursor];
      if (quote) {
        if (char === quote) quote = null;
      } else if (char === '"' || char === "'") {
        quote = char;
      } else if (char === ">") {
        break;
      }
      cursor += 1;
    }
    tags.push(html.slice(index, cursor + 1));
    index = cursor + 1;
  }
  return tags;
}

function attribute(tag, name) {
  const match = tag.match(new RegExp(`(?:@|x-on:)${name}\\s*=\\s*"([^"]*)"`, "s"));
  return match ? match[1] : null;
}

function violations(html, file) {
  const out = [];
  for (const tag of inputTags(html)) {
    if (!/\btype="number"/.test(tag)) continue;
    const disabled = /\bdisabled\b|:disabled=/.test(tag);
    const input = attribute(tag, "input");
    const change = attribute(tag, "change");

    if (input !== null) {
      const buffered = BUFFERED_HANDLERS.some((name) =>
        new RegExp(`\\b${name}\\s*\\(`).test(input)
      );
      if (!buffered) {
        out.push(`${file}: numeric @input must use a buffered handler (${input})`);
      }
      const value = tag.match(/:value\s*=\s*"([^"]*)"/s)?.[1] ?? "";
      if (!BUFFERED_VALUES.some((needle) => value.includes(needle))) {
        out.push(`${file}: buffered numeric input must bind :value through inputDraft`);
      }
      if (/(?:toFixed|formatWithDecimals|Math\.)/.test(tag)) {
        out.push(`${file}: buffered numeric input must not format in the tag`);
      }
    }

    if (change === null && !disabled) {
      out.push(`${file}: numeric input must commit on @change`);
    }
  }
  return out;
}

test("every numeric input is change-only or buffered", () => {
  const files = [
    "frontend/index.html",
    ...walk("frontend/src/partials", [".html"]).map(rel).sort(),
  ];
  const offenders = files.flatMap((file) => violations(read(file), file));
  assert.deepEqual(offenders, [], offenders.join("\n"));
});

test("the guard catches an unbuffered numeric input", () => {
  const bad =
    '<input type="number" :value="f.display" @input="edit(f, $event.target.value)" @change="commitField(f)" />';
  assert.ok(violations(bad, "synthetic.html").length > 0);
});
