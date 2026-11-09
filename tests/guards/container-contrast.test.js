import test from "node:test";
import assert from "node:assert/strict";

import { read } from "./util.js";
import { parseRules } from "./css-guard-util.js";

const TOKENS = "frontend/src/tokens.css";
const BOUNDARY_MIN = 2.0;
const DIVIDER_MIN = 1.1;
const TEXT_MIN = 4.5;

function tokenMaps() {
  const rules = parseRules(read(TOKENS));
  const light = {};
  const dark = {};
  for (const rule of rules) {
    if (rule.selector === ":root" && rule.context.length === 0) Object.assign(light, declarations(rule.declarations));
    if (rule.selector === ':root:not([data-theme="light"])' && rule.context.includes("@media (prefers-color-scheme: dark)")) {
      Object.assign(dark, declarations(rule.declarations));
    }
  }
  return { light, dark: { ...light, ...dark } };
}

function declarations(rule) {
  const values = {};
  for (const entry of rule) {
    const split = entry.indexOf(":");
    if (split > 0) values[entry.slice(0, split).trim()] = entry.slice(split + 1).trim();
  }
  return values;
}

function resolver(values) {
  function resolve(name) {
    const value = values[name];
    if (!value) throw new Error(`missing token ${name}`);
    const variable = /^var\((--[a-z0-9-]+)\)$/.exec(value);
    return variable ? resolve(variable[1]) : value;
  }
  return resolve;
}

function channel(value) {
  const normalized = value / 255;
  return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error(`not a resolvable hex token: ${hex}`);
  const value = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((index) => channel(parseInt(value.slice(index, index + 2), 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

const { light, dark } = tokenMaps();
const themes = [
  ["light", resolver(light)],
  ["dark", resolver(dark)],
];

for (const [name, resolve] of themes) {
  test(`container boundaries are visible in ${name}`, () => {
    for (const surface of ["surface-default", "surface-canvas", "surface-subtle"]) {
      const ratio = contrast(resolve("--sys-border-default"), resolve(`--sys-${surface}`));
      assert.ok(ratio >= BOUNDARY_MIN, `${surface} boundary ${ratio.toFixed(2)} < ${BOUNDARY_MIN}`);
    }
  });

  test(`row dividers stay quieter than boundaries in ${name}`, () => {
    for (const surface of ["surface-default", "surface-canvas", "surface-subtle"]) {
      const ratio = contrast(resolve("--sys-border-subtle"), resolve(`--sys-${surface}`));
      assert.ok(ratio >= DIVIDER_MIN, `${surface} divider ${ratio.toFixed(2)} < ${DIVIDER_MIN}`);
    }
  });

  test(`secondary text stays readable in ${name}`, () => {
    for (const surface of ["surface-default", "surface-subtle"]) {
      const ratio = contrast(resolve("--sys-text-secondary"), resolve(`--sys-${surface}`));
      assert.ok(ratio >= TEXT_MIN, `${surface} text ${ratio.toFixed(2)} < ${TEXT_MIN}`);
    }
  });
}
