import test from "node:test";
import assert from "node:assert/strict";

import {
  PROSE_MAX_SOURCE_CODE_POINTS,
  createProseValidator,
} from "../../frontend/src/markdown/validate.js";

function codes(result) {
  return result.issues.map((entry) => entry.code);
}

test("plain prose is valid", () => {
  const validator = createProseValidator();
  assert.deepEqual(validator.validate("A clean note."), { ok: true, issues: [] });
  assert.deepEqual(validator.validate(""), { ok: true, issues: [] });
  assert.deepEqual(validator.validate(null), { ok: true, issues: [] });
});

test("supported markdown is not flagged", () => {
  const validator = createProseValidator();
  const result = validator.validate(
    "**bold** *em* ~~strike~~ `code` [link](https://example.com)\n\n- one\n- two\n\n> quote"
  );
  assert.equal(result.ok, true);
});

test("unsupported constructs are flagged", () => {
  const validator = createProseValidator();
  assert.ok(codes(validator.validate("| a | b |\n|---|---|\n| 1 | 2 |")).includes("prose.unsupported.table"));
  assert.ok(codes(validator.validate("![alt](https://example.com/x.png)")).includes("prose.unsupported.image"));
  assert.ok(codes(validator.validate("<script>alert(1)</script>")).includes("prose.unsupported.html"));
});

test("unsafe links are flagged and safe links are not", () => {
  const validator = createProseValidator();
  assert.deepEqual(codes(validator.validate("[bad](javascript:alert(1))")), ["prose.unsafe.link"]);
  assert.deepEqual(codes(validator.validate("[good](https://example.com)")), []);
});

test("source length is measured in code points", () => {
  const validator = createProseValidator();
  const under = "😀".repeat(PROSE_MAX_SOURCE_CODE_POINTS - 1);
  const over = "😀".repeat(PROSE_MAX_SOURCE_CODE_POINTS + 1);
  assert.equal(codes(validator.validate(under)).includes("prose.too_long"), false);
  assert.deepEqual(codes(validator.validate(over)), ["prose.too_long"]);
});

test("deep nesting is flagged", () => {
  const validator = createProseValidator();
  assert.ok(codes(validator.validate(`${"> ".repeat(40)}deep`)).includes("prose.too_deep"));
});

test("memoized results are the same object", () => {
  const validator = createProseValidator();
  const text = "**same** text";
  assert.equal(validator.validate(text), validator.validate(text));
});

test("the cache is bounded by entry count", () => {
  const validator = createProseValidator({ maxEntries: 1 });
  const first = validator.validate("first");
  validator.validate("second");
  assert.notEqual(validator.validate("first"), first);
});

test("issue messages are stable", () => {
  const validator = createProseValidator();
  const [issue] = validator.validate("| a |\n|---|\n| b |").issues;
  assert.equal(issue.code, "prose.unsupported.table");
  assert.equal(issue.message, "Tables print as plain text in the PDF.");
});
