// The step shell is retired: no module may read its cursor or its navigation.
// The wall owns scroll (wall.js) and the drawer owns focus (drawer.js).

import test from "node:test";
import assert from "node:assert/strict";

import { read, rel, walk } from "./util.js";

const RETIRED = /\b(activeStep|activeIndex|highwater|stepperSteps|navDir|navClass|selectStep|resetToDiscussion|resetToStep|syncNav|keyNav)\b/g;

test("no module reads the retired step cursor or its navigation", () => {
  const found = [];
  for (const file of walk("frontend/src", [".js", ".html"]).map(rel)) {
    const text = read(file);
    for (const match of text.matchAll(RETIRED)) {
      const line = text.slice(0, match.index).split("\n").length;
      found.push(`${file}:${line}: ${match[1]}`);
    }
  }
  assert.deepEqual(found, []);
});

test("the step manifest carries no partials and no navigation module exists", () => {
  assert.doesNotMatch(read("frontend/src/views/steps.js"), /partial:/);
});
