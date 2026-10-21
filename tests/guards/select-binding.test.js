import test from "node:test";
import assert from "node:assert/strict";
import { read, rel, walk } from "./util.js";

// A <select> bound one-way via `:value` renders its options through `x-for`. On
// re-mount (the editor/step `x-if` boundaries) the select's value is applied
// before the x-for options exist, so the browser falls back to the first option
// and the saved value is displayed wrong. The fix is an explicit `:selected` on
// each option; this guard makes that invariant enforced rather than conventional.
const SELECT_WITH_VALUE = /<select\b[^>]*:value\s*=[^>]*>([\s\S]*?)<\/select>/g;

test("selects bound via :value render a :selected option", () => {
  const files = [
    "frontend/index.html",
    ...walk("frontend/src/partials", [".html"]).map(rel),
  ];
  const offenders = [];
  for (const f of files) {
    const html = read(f);
    for (const m of html.matchAll(SELECT_WITH_VALUE)) {
      if (m[1].includes("<template x-for") && !m[1].includes(":selected")) {
        offenders.push(`${f}: <select :value> with x-for options lacks :selected`);
      }
    }
  }
  assert.deepEqual(offenders, [], offenders.join("\n"));
});
