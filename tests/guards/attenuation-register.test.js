// The attenuation model's assumption register must stay executable: every row
// names a test that exists, and the register covers A1–A15. A row whose
// enforcement file disappears (or a doc edit that drops a row) fails here.

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const DOC = readFileSync(`${ROOT}docs/attenuation-model.md`, "utf8");

const SECTION = DOC.split("## 6. Assumption register")[1]?.split("\n## ")[0] ?? "";
const ROWS = SECTION.split("\n")
  .map((line) => line.trim())
  .filter((line) => /^\| A\d+ \|/.test(line))
  .map((line) => {
    const cells = line
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim());
    return { id: cells[0], treatment: cells[2], enforcement: cells[3] };
  });

test("the register covers A1–A15", () => {
  const expected = Array.from({ length: 15 }, (_, index) => `A${index + 1}`);
  assert.deepEqual(ROWS.map((row) => row.id), expected);
});

test("every register row names an existing test, or is explicitly doc-only", () => {
  for (const row of ROWS) {
    if (row.enforcement === "doc only") continue;
    const paths = [...row.enforcement.matchAll(/`(tests\/[^`]+)`/g)].map(
      (match) => match[1]
    );
    assert.ok(paths.length > 0, `${row.id} names no test file: ${row.enforcement}`);
    for (const path of paths) {
      assert.ok(existsSync(`${ROOT}${path}`), `${row.id}: missing ${path}`);
    }
  }
});
