import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import {
  buildFixture,
  compareSnapshots,
  inlineLoads,
  stripAlpine,
} from "../../scripts/visual-snapshot.mjs";
import { ROOT } from "./util.js";

const PARTIALS = path.join(ROOT, "frontend/src/partials");

test("the fixture strips Alpine directives and keeps templates inert", () => {
  const source = `<template x-if="open"><div x-data="{}" :class="{ active: on }" @click="go()">x</div></template>`;
  const out = stripAlpine(source);
  assert.equal(out.includes("x-data"), false);
  assert.equal(out.includes(":class"), false);
  assert.equal(out.includes("@click"), false);
  assert.equal(out.includes("<template"), true);
  assert.equal(out.includes("</template>"), true);
  assert.equal(out.includes("<div>x</div>"), true);
});

test("the fixture inlines partial loads", () => {
  const out = inlineLoads('<load src="src/partials/ui-form-fields.html" />', { partialsDir: PARTIALS });
  assert.equal(out.includes("<load"), false);
  assert.ok(out.length > 200, "expected the included partial markup");
});

test("the fixture carries the theme and file marker", () => {
  const html = buildFixture({
    tokens: ":root { --x: red; }",
    css: "body { color: red; }",
    partialsDir: PARTIALS,
    files: ["ui-form-fields.html"],
    theme: "dark",
  });
  assert.match(html, /data-theme="dark"/);
  assert.match(html, /--x: red/);
  assert.match(html, /data-fixture-file="ui-form-fields.html"/);
  assert.match(html, /animation: none !important/);
});

test("the comparator reports a changed property and ignores identical snapshots", () => {
  const before = [{ file: "a.html", elements: [{ index: 0, props: { color: "red" }, rect: [0, 0, 10, 10] }] }];
  const after = [{ file: "a.html", elements: [{ index: 0, props: { color: "blue" }, rect: [0, 0, 10, 10] }] }];
  assert.equal(compareSnapshots(before, before).diffs.length, 0);
  const diff = compareSnapshots(before, after);
  assert.equal(diff.diffs.length, 1);
  assert.match(diff.diffs[0], /color: red -> blue/);
});
