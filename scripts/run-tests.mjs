// Discover and run the frontend test suites.
//
// `node --test "<glob>"` exits 0 when the pattern matches nothing, so a broken
// glob turns a green build into a hollow one. This runner enumerates the files
// itself, refuses an empty directory, and hands the list to the test runner.
//
// Modes:
//   node scripts/run-tests.mjs                  discover every suite directory
//   node scripts/run-tests.mjs --dirs tests/guards   discover these roots only
//   node scripts/run-tests.mjs --files a b c    exactly these suites
//
// `--files` is for a caller that has already decided what is affected: every
// path must be an existing *.test.js inside a known root, and an empty list is
// refused rather than passed through. `--files` and `--dirs` must be the last
// option; everything before them is passed to node, so
// `--experimental-test-coverage` keeps working.

import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, readdirSync, statSync } from "node:fs";
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

function parseArgs(argv) {
  const at = argv.findIndex((arg) => arg === "--files" || arg === "--dirs");
  if (at < 0) return { mode: "discover", passthrough: argv, rest: [] };
  return {
    mode: argv[at] === "--files" ? "files" : "dirs",
    passthrough: argv.slice(0, at),
    rest: argv.slice(at + 1),
  };
}

function listedFiles(paths, failures) {
  const chosen = [];
  if (paths.length === 0) failures.push("--files needs at least one suite");
  for (const raw of paths) {
    const path = raw.replace(/^\.\//, "");
    if (!DIRS.some((dir) => path.startsWith(`${dir}/`))) {
      failures.push(`${raw} is outside ${DIRS.join(", ")}`);
    } else if (!path.endsWith(".test.js")) {
      failures.push(`${raw} is not a *.test.js suite`);
    } else if (!existsSync(join(ROOT, path))) {
      failures.push(`${raw} does not exist`);
    } else if (!chosen.includes(path)) {
      chosen.push(path);
    }
  }
  return chosen;
}

function listedDirs(paths, failures) {
  const chosen = [];
  if (paths.length === 0) failures.push("--dirs needs at least one directory");
  for (const raw of paths) {
    if (!DIRS.includes(raw)) failures.push(`${raw} is not one of ${DIRS.join(", ")}`);
    else if (!chosen.includes(raw)) chosen.push(raw);
  }
  return chosen;
}

function discovered(dirs, failures) {
  const files = [];
  for (const dir of dirs) {
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
  return files;
}

function select(args, failures) {
  if (args.mode === "files") return listedFiles(args.rest, failures);
  const dirs = args.mode === "dirs" ? listedDirs(args.rest, failures) : DIRS;
  return discovered(dirs, failures);
}

function label(args, files) {
  if (args.mode === "files") return `${files.length} selected ${files.length === 1 ? "file" : "files"}`;
  const dirs = args.mode === "dirs" ? args.rest : DIRS;
  return `${files.length} files across ${dirs.join(", ")}`;
}

function main() {
  const argv = process.argv.slice(2);
  const modes = argv.filter((arg) => arg === "--files" || arg === "--dirs");
  const failures = modes.length > 1 ? ["--files and --dirs are exclusive"] : [];
  const args = parseArgs(argv);
  const files = failures.length > 0 ? [] : select(args, failures);

  if (failures.length > 0) {
    console.error("run-tests: refusing to report success");
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exitCode = 1;
    return;
  }

  const nodeArgs = [
    "--test",
    ...args.passthrough,
    ...files.map((file) => relative(process.cwd(), join(ROOT, file))),
  ];

  const summary = label(args, files);
  console.log(`run-tests: ${summary}`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `**Frontend suites:** ${summary}\n`);
  }

  let status = 0;
  try {
    execFileSync(process.execPath, nodeArgs, { stdio: "inherit" });
  } catch (error) {
    status = error.status ?? 1;
  }
  process.exit(status);
}

main();
