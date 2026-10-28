// Post-hoc tripwire for the two pre-commit rules a `--no-verify` commit would
// bypass: a frozen path that was edited, and a manifest whose dependency blocks
// changed without its lockfile. The hook is local and optional; this runs in
// `make check` over the working tree, and in CI over a commit range
// (`--since <ref>`), where it cannot be skipped.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  FROZEN_PREFIXES,
  LOCK_PAIRS,
  dependencyFingerprint,
  isFrozenPath,
} from "./precommit.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

const args = process.argv.slice(2);
const sinceIndex = args.indexOf("--since");
const since = sinceIndex >= 0 ? args[sinceIndex + 1] : null;

const git = (...argv) =>
  execFileSync("git", argv, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

function changedPaths() {
  if (since) {
    return git("diff", "--name-only", "--diff-filter=ACMR", `${since}..HEAD`)
      .split("\n")
      .filter(Boolean);
  }
  return git("status", "--porcelain")
    .split("\n")
    .filter(Boolean)
    .map((line) => line.slice(3).trim())
    .filter(Boolean);
}

function contentAt(ref, path) {
  try {
    return git("show", `${ref}:${path}`);
  } catch {
    return null;
  }
}

function workingContent(path) {
  try {
    return readFileSync(join(ROOT, path), "utf8");
  } catch {
    return null;
  }
}

const failures = [];

if (since) {
  try {
    git("rev-parse", "--verify", `${since}^{commit}`);
  } catch {
    console.error(`check-hygiene: no such revision for --since: ${since}`);
    process.exit(1);
  }
}

const changed = new Set(changedPaths());

for (const path of changed) {
  if (isFrozenPath(path)) {
    failures.push(`${path} was changed under a frozen path (${FROZEN_PREFIXES.join(", ")})`);
  }
}

for (const [manifest, lock] of LOCK_PAIRS) {
  if (!changed.has(manifest)) continue;
  const before = since ? contentAt(since, manifest) : contentAt("HEAD", manifest);
  const after = since ? contentAt("HEAD", manifest) : workingContent(manifest);
  const depsChanged =
    before === null ||
    after === null ||
    dependencyFingerprint(manifest, before) !== dependencyFingerprint(manifest, after);
  if (depsChanged && !changed.has(lock)) {
    failures.push(`${manifest} changes dependencies but ${lock} did not change`);
  }
}

if (failures.length > 0) {
  console.error("check-hygiene: failing");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

const scope = since ? `${since}..HEAD` : "the working tree";
console.log(`repo hygiene: frozen paths untouched, manifest/lock pairs travel together (${scope})`);
