import test from "node:test";
import assert from "node:assert/strict";

import {
  PROSE_MAX_SOURCE_CODE_POINTS,
  PROSE_MAX_TABLE_COLUMNS,
  PROSE_MAX_TABLE_ROWS,
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

test("GFM tables are supported", () => {
  const validator = createProseValidator();
  const result = validator.validate(
    "| Left | Center | Right |\n| :--- | :----: | ----: |\n| one | **two** | `3` |"
  );
  assert.equal(result.ok, true);
});

test("unsupported constructs are flagged", () => {
  const validator = createProseValidator();
  assert.ok(codes(validator.validate("![alt](https://example.com/x.png)")).includes("prose.unsupported.image"));
  assert.ok(codes(validator.validate("<script>alert(1)</script>")).includes("prose.unsupported.html"));
});

test("table shape limits and malformed tables are flagged", () => {
  const validator = createProseValidator();
  const columns = Array.from({ length: PROSE_MAX_TABLE_COLUMNS + 1 }, (_, i) => `h${i}`);
  const wide = `| ${columns.join(" | ")} |\n| ${columns.map(() => "---").join(" | ")} |`;
  assert.deepEqual(codes(validator.validate(wide)), ["prose.too_many_table_columns"]);

  const rows = Array.from({ length: PROSE_MAX_TABLE_ROWS + 1 }, (_, i) => `| ${i} | row |`);
  const tall = `| a | b |\n| --- | --- |\n${rows.join("\n")}`;
  assert.deepEqual(codes(validator.validate(tall)), ["prose.too_many_table_rows"]);

  const malformed = "| Header 1 | Header 2 |\n| +++++ | +++++ |\n| One | Two |";
  assert.deepEqual(codes(validator.validate(malformed)), ["prose.malformed.table"]);
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
  const columns = Array.from({ length: PROSE_MAX_TABLE_COLUMNS + 1 }, (_, i) => `h${i}`);
  const source = `| ${columns.join(" | ")} |\n| ${columns.map(() => "---").join(" | ")} |`;
  const [issue] = validator.validate(source).issues;
  assert.equal(issue.code, "prose.too_many_table_columns");
  assert.equal(issue.message, "Tables are limited to 6 columns in the PDF.");
});
