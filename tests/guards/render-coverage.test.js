import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

import { renderBundle } from "../../scripts/render-bundle.mjs";
import { read } from "./util.js";

const ROOT = new URL("../../", import.meta.url).pathname;
const RENDERER = join(ROOT, "scripts", "render-bundle.mjs");

const STATES = [
  { name: "normal", path: "tests/conformance/fixtures/report-bundle.json" },
  {
    name: "draft",
    path: "tests/conformance/fixtures/report-states/draft-before-solve.json",
  },
  {
    name: "water-unavailable",
    path: "tests/conformance/fixtures/report-states/water-unavailable.json",
  },
].map((state) => ({ ...state, bundle: JSON.parse(read(state.path)) }));

test("the renderer covers exactly the oracle's printed paths", () => {
  for (const { name, bundle } of STATES) {
    const result = renderBundle(bundle);
    assert.deepEqual(
      result.scalars.map((row) => row.path).sort(),
      Object.keys(bundle.formatted).sort(),
      `${name}: rendered scalars must equal the oracle's input`
    );
    assert.deepEqual(result.unknown, [], `${name}: every printed path must resolve in the manifest`);
  }
});

test("tables and summaries follow the bundle", () => {
  for (const { name, bundle } of STATES) {
    const result = renderBundle(bundle);
    assert.deepEqual(
      result.tables.map((table) => table.id).sort(),
      Object.keys(bundle.formatted_tables).sort(),
      `${name}: tables`
    );
    assert.deepEqual(
      result.summaries.map((summary) => summary.id).sort(),
      Object.keys(bundle.formatted_summaries).sort(),
      `${name}: summaries`
    );
  }
});

test("every rendered value carries a label", () => {
  for (const { name, bundle } of STATES) {
    const result = renderBundle(bundle);
    for (const row of result.scalars) {
      assert.ok(row.label, `${name}: ${row.path} has no label`);
    }
    for (const table of result.tables) {
      assert.ok(table.label, `${name}: table ${table.id} has no label`);
      for (const column of table.columns) assert.ok(column.label);
    }
  }
});

test("the accepted gap is rendered and named", () => {
  const normal = STATES.find((state) => state.name === "normal");
  const result = renderBundle(normal.bundle);
  const gap = result.scalars.find((row) => row.path === "batch.late_addition_volume_l");

  assert.ok(gap, "the allowlisted value must still be rendered");
  assert.equal(gap.allowlisted, true);
  assert.ok(gap.reason);
});

test("the CLI renders every committed state", () => {
  for (const { name, path } of STATES) {
    const output = execFileSync(process.execPath, [RENDERER, join(ROOT, path)], {
      cwd: ROOT,
      encoding: "utf8",
    });
    assert.match(output, /^bundle: /m, `${name}: missing header`);
    assert.match(output, /^scalars \(\d+\)$/m, `${name}: missing scalar count`);
    assert.match(output, /^validation: /m, `${name}: missing validation line`);
  }
});
