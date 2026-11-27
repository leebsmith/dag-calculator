import test from "node:test";
import assert from "node:assert/strict";

import { fieldsets } from "../../frontend/src/views/fieldsets.js";
import { steps } from "../../frontend/src/views/steps.js";
import { read, rel, walk } from "./util.js";

const EDITOR = "frontend/src/partials/editor.html";

function stepPartials() {
  return walk("frontend/src/partials", [".html"])
    .map(rel)
    .filter((path) => /\/step-[^/]+\.html$/.test(path));
}

function globals(files) {
  const found = [];
  for (const { path, text } of files) {
    for (const match of text.matchAll(/\bactiveStep\b/g)) {
      const line = text.slice(0, match.index).split("\n").length;
      found.push(`${path}:${line}: partials bind the global activeStep`);
    }
  }
  return found;
}

function dispatchFailures(manifest, partials) {
  const found = [];
  const editor = read(EDITOR);
  const owners = new Map();
  for (const fieldset of manifest) {
    if (fieldset.partial) owners.set(fieldset.partial, (owners.get(fieldset.partial) ?? 0) + 1);
  }

  const ids = new Set();
  for (const fieldset of manifest) {
    if (typeof fieldset.id !== "string" || fieldset.id.trim() === "") {
      found.push("a fieldset has no id");
      continue;
    }
    if (ids.has(fieldset.id)) found.push(`"${fieldset.id}" is declared twice`);
    ids.add(fieldset.id);

    if (typeof fieldset.title !== "string" || fieldset.title.trim() === "") {
      found.push(`"${fieldset.id}" has no title`);
    }
    if (typeof fieldset.slice !== "string" || fieldset.slice.trim() === "") {
      found.push(`"${fieldset.id}" has no slice`);
    }

    const partial = String(fieldset.partial ?? "").replace(/^\.?\//, "");
    if (!partial) found.push(`"${fieldset.id}" names no partial`);
    else if (!partials.includes(`frontend/${partial}`)) {
      found.push(`"${fieldset.id}" names an unknown partial "${fieldset.partial}"`);
    }

    const named = editor.includes(`fieldset.id === '${fieldset.id}'`);
    const shared = (owners.get(fieldset.partial) ?? 0) > 1;
    if (shared && named) {
      found.push(`"${fieldset.id}" is named although its partial is the shared fallback`);
    }
    if (!shared && !named) {
      found.push(`"${fieldset.id}" is not dispatched by the editor shell`);
    }
  }

  const dispatched = [...editor.matchAll(/fieldset\.id === '([^']+)'/g)].map((match) => match[1]);
  for (const id of dispatched) {
    if (!ids.has(id)) found.push(`the editor dispatches unknown fieldset "${id}"`);
  }
  return found;
}

test("no step partial binds the global active step", () => {
  assert.deepEqual(
    globals(stepPartials().map((path) => ({ path, text: read(path) }))),
    []
  );
});

test("no frontend module reads the retired global active step", () => {
  assert.deepEqual(
    globals(walk("frontend/src", [".js", ".html"]).map((abs) => ({ path: rel(abs), text: read(rel(abs)) }))),
    []
  );
});

test("the fieldset manifest matches the step order and is fully dispatched", () => {
  assert.deepEqual(
    fieldsets.map((fieldset) => fieldset.id),
    steps.map((step) => step.id)
  );
  assert.deepEqual(dispatchFailures(fieldsets, stepPartials()), []);
});

test("a partial reading activeStep fails", () => {
  assert.deepEqual(
    globals([{ path: "frontend/src/partials/step-orphan.html", text: '<h2 x-text="activeStep.title"></h2>' }]),
    ["frontend/src/partials/step-orphan.html:1: partials bind the global activeStep"]
  );
});

test("a fieldset that names an unknown partial fails", () => {
  const mutated = structuredClone(fieldsets);
  mutated[0].partial = "./src/partials/step-missing.html";
  assert.deepEqual(dispatchFailures(mutated, stepPartials()), [
    `"${mutated[0].id}" names an unknown partial "./src/partials/step-missing.html"`,
  ]);
});

test("a fieldset the shell does not dispatch fails", () => {
  const mutated = structuredClone(fieldsets);
  mutated[0].id = "orphan";
  assert.deepEqual(dispatchFailures(mutated, stepPartials()), [
    '"orphan" is not dispatched by the editor shell',
    'the editor dispatches unknown fieldset "discussion"',
  ]);
});
