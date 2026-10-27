// The described-bundle dump is a reference artefact for authoring report
// sections, so its shape is pinned: a path row must name its display symbol and
// taxonomy labels must appear in their own block.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

function describe(bundle) {
  const dir = mkdtempSync(join(tmpdir(), "describe-bundle-"));
  const file = join(dir, "bundle.json");
  writeFileSync(file, JSON.stringify(bundle));
  return execFileSync(process.execPath, ["scripts/describe-report-bundle.mjs", file], {
    cwd: ROOT,
    encoding: "utf8",
  });
}

function bundleWith(nodes, valuation) {
  return {
    batch: { id: "b1", name: "House Pale", status: "frozen", frozen_at: 1700000000, identity: {} },
    artifact: { schema_version: 9, hash: "sha256:artifact" },
    content_hash: "sha256:content",
    state: { valuation },
    catalog: { nodes },
  };
}

test("rows carry the value, label, unit id, and display symbol", () => {
  const out = describe(
    bundleWith(
      {
        "mash.strike_water_temp_c": {
          label: "Strike water temp",
          dimension: "temperature",
          unit: "degC",
          symbol: "°C",
          decimals: 1,
        },
      },
      { "mash.strike_water_temp_c": 68.3 }
    )
  );
  assert.match(out, /^mash\.strike_water_temp_c = 68\.3 {2}\/\/ Strike water temp \[degC → °C\]$/m);
});

test("taxonomy labels are listed in their own block", () => {
  const out = describe(
    bundleWith(
      {
        "batch.topology": {
          label: "Constraint Topology",
          options: ["r_l_to_g", "runoff_ratio"],
          option_labels: { runoff_ratio: "Runnings ratio (r)", r_l_to_g: "Liquor-to-grist ratio" },
        },
      },
      { "batch.topology": "runoff_ratio" }
    )
  );
  assert.match(out, /^option labels$/m);
  assert.match(
    out,
    /^ {2}batch\.topology: r_l_to_g=Liquor-to-grist ratio, runoff_ratio=Runnings ratio \(r\)$/m
  );
});

test("the label block is omitted when no node has labels", () => {
  const out = describe(
    bundleWith({ "batch.topology": { label: "Constraint Topology", options: ["r_l_to_g"] } }, {
      "batch.topology": "r_l_to_g",
    })
  );
  assert.doesNotMatch(out, /option labels/);
});
