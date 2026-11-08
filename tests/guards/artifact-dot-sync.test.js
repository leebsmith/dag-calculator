import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { artifact, read } from "./util.js";

const ROOT = new URL("../../", import.meta.url).pathname;
const GENERATOR = join(ROOT, "tools", "generate_artifact_dot.py");
const PYTHON = process.env.PYTHON ?? "python3";

function generatedDot() {
  const directory = mkdtempSync(join(tmpdir(), "artifact-dot-"));
  const output = join(directory, "artifact.dot");
  try {
    execFileSync(PYTHON, [GENERATOR, "--out", output], { cwd: ROOT, stdio: "pipe" });
    return readFileSync(output, "utf8");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("the committed artifact dot is in sync with the generator", () => {
  assert.equal(
    read("docs/artifact_dag.dot"),
    generatedDot(),
    "docs/artifact_dag.dot is stale — run `make dot`"
  );
});

test("the committed artifact dot names every node and relation", () => {
  const dot = read("docs/artifact_dag.dot");
  const source = artifact();
  for (const nodeId of Object.keys(source.nodes)) {
    assert.ok(dot.includes(`id="${nodeId}"`), `missing node ${nodeId}`);
  }
  for (const relation of source.relations) {
    assert.ok(dot.includes(`id="rel_${relation.id}"`), `missing relation ${relation.id}`);
  }
});
