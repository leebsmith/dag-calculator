// The printed water objective names the profile or the custom set, never a
// routing code. The card dropped the mode vocabulary; the report must not keep
// it alive on its own.

import test from "node:test";
import assert from "node:assert/strict";

import { read } from "./util.js";

test("the printed water objective never cites a strategy code", () => {
  const text = read("backend/app/templates/sections/water-chemistry.typ");
  assert.equal(/solver\.water\.strategy/.test(text), false);
  assert.match(text, /Custom objectives/);
});
