import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildGraph } from "../../frontend/src/engine/dag.js";
import { assign, membersByStation } from "../../scripts/emit-artifact-arc.mjs";
import { artifact, read } from "./util.js";

const ROOT = new URL("../../", import.meta.url).pathname;
const EMITTER = join(ROOT, "scripts", "emit-artifact-arc.mjs");
const ARTIFACT = artifact();
const GRAPH = buildGraph(ARTIFACT);

function generated() {
  const directory = mkdtempSync(join(tmpdir(), "artifact-arc-"));
  const output = join(directory, "artifact-arc.md");
  try {
    execFileSync(process.execPath, [EMITTER, "--out", output], { cwd: ROOT, stdio: "pipe" });
    return readFileSync(output, "utf8");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("the committed arc is in sync with its emitter", () => {
  assert.equal(
    read("docs/artifact-arc.md"),
    generated(),
    "docs/artifact-arc.md is stale — run `make generate`"
  );
});

test("every node belongs to exactly one station", () => {
  const members = membersByStation(ARTIFACT, assign(ARTIFACT, GRAPH));
  const all = Object.values(members).flat();
  assert.deepEqual(
    [...all].sort(),
    Object.keys(ARTIFACT.nodes).sort(),
    "the stations must partition the artifact"
  );
  assert.equal(new Set(all).size, all.length, "a node appears in two stations");
});

test("the editorial overrides land where the document says", () => {
  const members = membersByStation(ARTIFACT, assign(ARTIFACT, GRAPH));

  assert.deepEqual(members.treatment.sort(), ["solver.water", "water.pinned_ions", "water.route"]);
  assert.deepEqual(members.alongside, ["batch.brew_checklist", "batch.process_notes"]);
  assert.ok(members.beer.includes("batch.realized_abv"));
  assert.ok(members.beer.includes("batch.realized_fg"));
  assert.ok(members.beer.includes("batch.attenuation_above_cap"));
  assert.ok(members.beer.includes("grist.finished_beer_srm"));
});

test("the mandated spine is the only boundary order", () => {
  const upstream = (id) => {
    const seen = new Set();
    const queue = [...(GRAPH.adjacency[id] ?? [])];
    while (queue.length > 0) {
      const current = queue.pop();
      if (seen.has(current)) continue;
      seen.add(current);
      for (const next of GRAPH.adjacency[current] ?? []) if (!seen.has(next)) queue.push(next);
    }
    return seen;
  };

  const batch = upstream("solver.batch");
  const hops = upstream("solver.hops");
  const water = upstream("solver.water");

  assert.equal([...batch].filter((id) => ARTIFACT.nodes[id].kind === "boundary").length, 0);
  assert.deepEqual([...hops].filter((id) => ARTIFACT.nodes[id].kind === "boundary"), ["solver.batch"]);
  assert.deepEqual([...water].filter((id) => ARTIFACT.nodes[id].kind === "boundary"), ["solver.batch"]);
  assert.ok(!hops.has("solver.water"));
  assert.ok(!water.has("solver.hops"));
});
