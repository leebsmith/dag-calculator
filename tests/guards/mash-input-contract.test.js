import test from "node:test";
import assert from "node:assert/strict";

import { read } from "./util.js";

test("mash draft temperature commits on change, not on input", () => {
  const html = read("frontend/src/partials/mash-rests-modal.html");
  assert.match(html, /@change="setMashDraftTemp\(/);
  assert.doesNotMatch(html, /@input="setMashDraftTemp\(/);
});
