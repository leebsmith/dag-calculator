import test from "node:test";
import assert from "node:assert/strict";

import { read } from "./util.js";
import { parseRules } from "./css-guard-util.js";
import { STORAGE_KEY, THEMES } from "../../frontend/src/store/theme.js";

const TOKENS = "frontend/src/tokens.css";
const INDEX = "frontend/index.html";
const INIT = "frontend/public/theme-init.js";
const CONTROL = "frontend/src/partials/ui-theme-control.html";
const MENUS = ["editor.html", "chooser.html", "import.html", "library.html"];

function rule(rules, selector, context) {
  return rules.find(
    (candidate) =>
      candidate.selector === selector &&
      (context === undefined || candidate.context.includes(context))
  );
}

test("the media and manual dark blocks stay identical", () => {
  const rules = parseRules(read(TOKENS));
  const media = rule(rules, ':root:not([data-theme="light"])', "@media (prefers-color-scheme: dark)");
  const manual = rule(rules, ':root[data-theme="dark"]');
  assert.ok(media, "missing the prefers-color-scheme dark block");
  assert.ok(manual, "missing the data-theme dark block");
  const mediaDeclarations = media.declarations.filter((decl) => !decl.startsWith("color-scheme:"));
  const manualDeclarations = manual.declarations.filter((decl) => !decl.startsWith("color-scheme:"));
  assert.deepEqual(manualDeclarations, mediaDeclarations);
});

test("the explicit theme modes set color-scheme", () => {
  const rules = parseRules(read(TOKENS));
  const light = rule(rules, ':root[data-theme="light"]');
  const dark = rule(rules, ':root[data-theme="dark"]');
  assert.ok(light.declarations.includes("color-scheme: light"));
  assert.ok(dark.declarations.includes("color-scheme: dark"));
  const base = rules.find((candidate) => candidate.selector === ":root" && candidate.declarations.includes("color-scheme: light dark"));
  assert.ok(base, "base :root must allow both color schemes");
});

test("the pre-paint script runs before the stylesheet and shares the key", () => {
  const index = read(INDEX);
  const script = index.indexOf('<script src="/theme-init.js"></script>');
  const stylesheet = index.indexOf('/src/tokens.css');
  assert.ok(script >= 0, "index.html must load theme-init.js");
  assert.ok(stylesheet > script, "theme-init.js must load before the stylesheet");
  assert.match(read(INIT), new RegExp(`"${STORAGE_KEY}"`));
});

test("the theme control is surfaced in every menu and offers all modes", () => {
  const control = read(CONTROL);
  for (const mode of THEMES) assert.match(control, new RegExp(`value="${mode}"`));
  for (const file of MENUS) {
    assert.match(read(`frontend/src/partials/${file}`), /ui-theme-control\.html/, `${file} needs the theme control`);
  }
});
