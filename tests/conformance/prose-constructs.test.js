import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { createProseValidator } from "../../frontend/src/markdown/validate.js";

const CASES = JSON.parse(
  readFileSync(new URL("./fixtures/prose-constructs.json", import.meta.url), "utf8")
);

test("the frontend validator agrees with the shared prose construct corpus", () => {
  const validator = createProseValidator();
  for (const entry of CASES) {
    assert.deepEqual(
      validator.validate(entry.source).issues.map((issue) => issue.code),
      entry.codes,
      entry.name
    );
  }
});
