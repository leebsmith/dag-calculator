// Anti-drift gates for the report section registry: the generated table, the
// registry/file contract, and the parser itself (so the checks that are vacuous
// with an empty registry still have coverage).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  buildSectionsDoc,
  findContractViolations,
  parseRegistry,
  readRegistry,
  readSectionFiles,
} from "../../scripts/report-sections.mjs";

const SAMPLE = `// === registry:begin ===
// One line per section:
#let sections = (
  (id: "mash-rests", title: "Mash rests", present: present-mash-rests, render: render-mash-rests),
  (id: "water-chemistry", title: "Water chemistry", present: present-water, render: render-water),
)
// === registry:end ===
`;

test("report section table is in sync with the registry literal", () => {
  const sections = readRegistry();
  const expected = buildSectionsDoc(sections);
  const actual = readFileSync(
    fileURLToPath(new URL("../../docs/report-sections.md", import.meta.url)),
    "utf8"
  );
  assert.equal(
    actual,
    expected,
    "docs/report-sections.md is stale — run `node scripts/emit-report-sections.mjs`"
  );
});

test("the registry and the section files agree", () => {
  assert.deepEqual(findContractViolations(readRegistry(), readSectionFiles()), []);
});

test("the parser reads one entry per line, in order", () => {
  assert.deepEqual(parseRegistry(SAMPLE), [
    {
      id: "mash-rests",
      title: "Mash rests",
      present: "present-mash-rests",
      render: "render-mash-rests",
    },
    {
      id: "water-chemistry",
      title: "Water chemistry",
      present: "present-water",
      render: "render-water",
    },
  ]);
});

test("an unparsable registry entry fails loudly instead of being dropped", () => {
  const broken = SAMPLE.replace(
    'present: present-water, render: render-water',
    'present: "water", render: render-water'
  );
  assert.throws(() => parseRegistry(broken), /unparsable registry entry/);
});

test("missing files, orphan files, and duplicates are contract violations", () => {
  const sections = parseRegistry(SAMPLE);
  assert.deepEqual(findContractViolations(sections, ["mash-rests"]), [
    "section \"water-chemistry\" has no sections/water-chemistry.typ",
  ]);
  assert.deepEqual(findContractViolations(sections, ["mash-rests", "water-chemistry", "extra"]), [
    "sections/extra.typ is not in the registry",
  ]);
  assert.equal(
    findContractViolations([sections[0], sections[0]], ["mash-rests"]).includes(
      'duplicate section id "mash-rests"'
    ),
    true
  );
});

test("a section without a presence predicate is rejected", () => {
  const sections = parseRegistry(SAMPLE);
  const violations = findContractViolations(
    [{ ...sections[0], present: "" }],
    ["mash-rests"]
  );
  assert.equal(violations.some((line) => line.includes("no presence predicate")), true);
});
