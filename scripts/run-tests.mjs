// Discover and run the frontend test suites.
//
// `node --test "<glob>"` exits 0 when the pattern matches nothing, so a broken
// glob turns a green build into a hollow one. This runner enumerates the files
// itself, refuses an empty directory, and hands the list to the test runner.

import { execFileSync } from "node:child_process";
import { appendFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const DIRS = ["tests/frontend", "tests/conformance", "tests/guards"];

function collect(dir, out = []) {
  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) collect(path, out);
    else if (entry.name.endsWith(".test.js") && statSync(join(ROOT, path)).isFile()) out.push(path);
  }
  return out;
}

const failures = [];
const files = [];
for (const dir of DIRS) {
  let found = [];
  try {
    found = collect(dir);
  } catch {
    failures.push(`${dir} is missing`);
    continue;
  }
  if (found.length === 0) failures.push(`${dir} holds no *.test.js files`);
  files.push(...found);
}

if (failures.length > 0) {
  console.error("run-tests: refusing to report success");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

const argv = [
  "--test",
  ...process.argv.slice(2),
  ...files.map((file) => relative(process.cwd(), join(ROOT, file))),
];

console.log(`run-tests: ${files.length} files across ${DIRS.join(", ")}`);
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    `**Frontend suites:** ${files.length} files discovered across ${DIRS.join(", ")}\n`
  );
}

let status = 0;
try {
  execFileSync(process.execPath, argv, { stdio: "inherit" });
} catch (error) {
  status = error.status ?? 1;
}
process.exit(status);
