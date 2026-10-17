import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const DIR = fileURLToPath(new URL("../../data/sources/", import.meta.url));
const manifest = JSON.parse(
  readFileSync(new URL("../../data/sources/manifest.json", import.meta.url), "utf8")
);

test("sources manifest matches every committed raw source", () => {
  const files = readdirSync(DIR)
    .filter((file) => file.endsWith(".json") && file !== "manifest.json")
    .sort();

  assert.deepEqual(Object.keys(manifest.sources).sort(), files, "manifest file set");

  for (const file of files) {
    const raw = readFileSync(`${DIR}${file}`, "utf8");
    const data = JSON.parse(raw);
    const entry = manifest.sources[file];
    assert.ok(entry.mechanism, `${file} missing mechanism`);
    assert.equal(
      entry.sha256,
      createHash("sha256").update(raw).digest("hex"),
      `${file} sha256 is stale — run node scripts/emit-sources-manifest.mjs`
    );
    assert.equal(
      entry.rows,
      Array.isArray(data) ? data.length : Object.keys(data).length,
      `${file} row count is stale — run node scripts/emit-sources-manifest.mjs`
    );
  }
});
