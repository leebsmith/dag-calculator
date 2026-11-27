import test from "node:test";
import assert from "node:assert/strict";

import { fieldsets } from "../../frontend/src/views/fieldsets.js";
import { read, rel, walk } from "./util.js";

const EDITOR = "frontend/src/partials/editor.html";

function partials() {
  return walk("frontend/src/partials", [".html"]).map(rel);
}

function globals(files) {
  const found = [];
  for (const { path, text } of files) {
    for (const match of text.matchAll(/\bactiveStep\b/g)) {
      const line = text.slice(0, match.index).split("\n").length;
      found.push(`${path}:${line}: reads the retired global activeStep`);
    }
  }
  return found;
}

function dispatchFailures(manifest, files) {
  const found = [];
  const editor = read(EDITOR);
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

    const partial = `frontend/src/partials/${String(fieldset.partial ?? "").replace(/^\.?\/*src\/partials\//, "")}`;
    if (!files.includes(partial)) {
      found.push(`"${fieldset.id}" names an unknown partial "${fieldset.partial}"`);
    }

    if (!editor.includes(`fieldset.id === '${fieldset.id}'`)) {
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
    globals(partials().filter((path) => /\/wall-[^/]+\.html$/.test(path)).map((path) => ({ path, text: read(path) }))),
    []
  );
});

test("no frontend module reads the retired global active step", () => {
  assert.deepEqual(
    globals(walk("frontend/src", [".js", ".html"]).map((abs) => ({ path: rel(abs), text: read(rel(abs)) }))),
    []
  );
});

test("every fieldset is dispatched by the shell", () => {
  assert.deepEqual(dispatchFailures(fieldsets, partials()), []);
});

test("a fieldset that names an unknown partial fails", () => {
  const mutated = structuredClone(fieldsets);
  mutated[0].partial = "./src/partials/wall-missing.html";
  assert.deepEqual(dispatchFailures(mutated, partials()), [
    `"${mutated[0].id}" names an unknown partial "./src/partials/wall-missing.html"`,
  ]);
});

test("a fieldset the shell does not dispatch fails", () => {
  const mutated = structuredClone(fieldsets);
  mutated[0].id = "orphan";
  assert.deepEqual(dispatchFailures(mutated, partials()), [
    '"orphan" is not dispatched by the editor shell',
    'the editor dispatches unknown fieldset "targets"',
  ]);
});
