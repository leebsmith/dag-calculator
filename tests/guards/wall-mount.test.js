import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import { fieldsets } from "../../frontend/src/views/fieldsets.js";
import { read, rel, walk } from "./util.js";

const LOAD = /<load\s+[^>]*?src="([^"]+)"/g;
const ID = /\sid="([^"]+)"/g;

function mounts() {
  const files = walk("frontend/src/partials", [".html"]).map(rel);
  const byName = new Map(files.map((file) => [path.basename(file), file]));

  function walkFile(file, owner, out = new Set()) {
    if (out.has(file)) return out;
    out.add(file);
    const text = read(file);
    for (const match of text.matchAll(LOAD)) {
      const target = byName.get(path.basename(match[1]));
      if (target) walkFile(target, owner, out);
    }
    return out;
  }

  return fieldsets.map((fieldset) => {
    const file = `frontend/src/partials/${path.basename(fieldset.partial)}`;
    return { id: fieldset.id, files: walkFile(file, fieldset.id) };
  });
}

function duplicateIds(mounted) {
  const origins = new Map();
  for (const { id, files } of mounted) {
    for (const file of files) {
      for (const match of read(file).matchAll(ID)) {
        origins.set(`${match[1]}`, [...(origins.get(`${match[1]}`) ?? []), `${file} (${id})`]);
      }
    }
  }
  return [...origins]
    .filter(([, readers]) => readers.length > 1)
    .map(([id, readers]) => `#${id} mounts in ${readers.join(", ")}`);
}

test("every fieldset mounts its partial once, with its includes resolved", () => {
  const mounted = mounts();
  assert.equal(mounted.length, fieldsets.length);
  const partials = mounted.map(({ files }) => [...files][0]);
  assert.equal(new Set(partials).size, partials.length, "two fieldsets mount the same partial");
  for (const { id, files } of mounted) {
    assert.ok(files.size > 1, `"${id}" mounts nothing but its own partial`);
  }
});

test("the mounted wall has no duplicate literal id", () => {
  assert.deepEqual(duplicateIds(mounts()), []);
});

test("a modal mounted by two fieldsets fails", () => {
  const mounted = [
    { id: "a", files: new Set(["frontend/src/partials/modal-malt-editor.html"]) },
    { id: "b", files: new Set(["frontend/src/partials/modal-malt-editor.html"]) },
  ];
  assert.ok(
    duplicateIds(mounted).some((message) => message.startsWith("#")),
    "a literal id in two mounts is a duplicate"
  );
});
