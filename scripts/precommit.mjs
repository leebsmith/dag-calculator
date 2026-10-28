import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

const ARTIFACT = "data/artifact.json";
const ARTIFACT_FIXTURE = "tests/conformance/fixtures/report-bundle.json";

export const GENERATORS = [
  {
    name: "artifact inventory",
    command: process.execPath,
    args: ["scripts/emit-artifact-inventory.mjs"],
    outputs: ["docs/dag-artifacts/inventory.md"],
  },
  {
    name: "frontend ownership",
    command: process.execPath,
    args: ["scripts/emit-ownership-index.mjs"],
    outputs: ["docs/frontend-ownership.md"],
  },
  {
    name: "report bundle glossary",
    command: process.execPath,
    args: ["scripts/emit-report-bundle-glossary.mjs"],
    outputs: ["docs/report-bundle-glossary.md"],
  },
  {
    name: "report sections",
    command: process.execPath,
    args: ["scripts/emit-report-sections.mjs"],
    outputs: ["docs/report-sections.md"],
  },
  {
    name: "sources manifest",
    command: process.execPath,
    args: ["scripts/emit-sources-manifest.mjs"],
    outputs: ["data/sources/manifest.json"],
  },
  {
    name: "seed catalogs",
    command: "make",
    args: ["--no-print-directory", "seeds"],
    outputs: [
      "data/seeds/styles.json",
      "data/seeds/yeasts.json",
      "data/seeds/hops.json",
      "data/seeds/malts.json",
      "data/seeds/sugars.json",
      "data/seeds/standard-malts.json",
      "data/seeds/hop-products.json",
    ],
  },
];

export const GENERATED_PATHS = GENERATORS.flatMap((generator) => generator.outputs);

export const FROZEN_PREFIXES = ["docs/historical/", "docs/adsco/"];

// AGENTS.md keeps docs/adsco/ui.md (the reconciled UI model) living while the
// vendored specs around it are frozen.
export const LIVING_EXCEPTIONS = new Set(["docs/adsco/ui.md"]);

export const LOCK_PAIRS = [
  ["package.json", "package-lock.json"],
  ["frontend/package.json", "frontend/package-lock.json"],
  ["backend/pyproject.toml", "backend/uv.lock"],
];

export function isFrozenPath(path) {
  if (LIVING_EXCEPTIONS.has(path)) return false;
  return FROZEN_PREFIXES.some((prefix) => path.startsWith(prefix));
}

// A manifest's dependency blocks, normalised to a comparable string. The lock
// pair exists to catch a dependency change without its lockfile; editing a
// script, a version field, or a tool setting is not that, and demanding a fresh
// lockfile for it is how a rule gets worked around instead of followed.
export function dependencyFingerprint(path, text) {
  if (path.endsWith(".json")) {
    const doc = JSON.parse(text);
    return JSON.stringify([
      doc.dependencies ?? {},
      doc.devDependencies ?? {},
      doc.optionalDependencies ?? {},
      doc.peerDependencies ?? {},
    ]);
  }
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(
      (line) => /^"[^"]+"\s*,?$/.test(line) || /^(dependencies|requires-python|dev)\s*=/.test(line)
    )
    .join("\n");
}

export function findViolations({ staged, dirtyGenerated = [], changedDeps = null }) {
  const stagedSet = new Set(staged);
  return [
    ...frozenViolations(staged),
    ...fixtureViolations(stagedSet),
    ...lockViolations(stagedSet, changedDeps),
    ...dirtyGenerated.map(
      (path) =>
        `${path} has unstaged edits; refusing to regenerate over them — stage or discard them first`
    ),
  ];
}

function frozenViolations(staged) {
  return staged.filter((path) => isFrozenPath(path)).map((path) => {
    const frozen = FROZEN_PREFIXES.find((prefix) => path.startsWith(prefix));
    return `${path} is under ${frozen}, which is frozen (see AGENTS.md); use --no-verify only if this is intentional`;
  });
}

function fixtureViolations(stagedSet) {
  if (!stagedSet.has(ARTIFACT) || stagedSet.has(ARTIFACT_FIXTURE)) return [];
  return [`${ARTIFACT} is staged but ${ARTIFACT_FIXTURE} is not — run \`make generate\``];
}

function lockViolations(stagedSet, changedDeps) {
  const out = [];
  for (const [manifest, lock] of LOCK_PAIRS) {
    if (!stagedSet.has(manifest)) continue;
    if (changedDeps && !changedDeps.has(manifest)) continue;
    if (!stagedSet.has(lock)) {
      out.push(`${manifest} is staged but ${lock} is not — regenerate the lockfile`);
    }
  }
  return out;
}

function git(args, options = {}) {
  return execFileSync("git", args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });
}

function stagedPaths() {
  return git(["diff", "--cached", "--name-only"]).split("\n").filter(Boolean);
}

function hasWorktreeEdits(path) {
  try {
    git(["diff", "--quiet", "--", path]);
    return false;
  } catch (error) {
    if (error.status === 1) return true;
    throw error;
  }
}

function blob(ref) {
  try {
    return git(["show", ref]);
  } catch {
    return null;
  }
}

function changedManifests(staged) {
  const changed = new Set();
  for (const [manifest] of LOCK_PAIRS) {
    if (!staged.includes(manifest)) continue;
    const before = blob(`HEAD:${manifest}`);
    const after = blob(`:${manifest}`);
    if (before === null || after === null) {
      changed.add(manifest);
      continue;
    }
    if (dependencyFingerprint(manifest, before) !== dependencyFingerprint(manifest, after)) {
      changed.add(manifest);
    }
  }
  return changed;
}

function main() {
  const staged = stagedPaths();
  const dirtyGenerated = GENERATED_PATHS.filter(hasWorktreeEdits);
  const violations = findViolations({
    staged,
    dirtyGenerated,
    changedDeps: changedManifests(staged),
  });

  if (violations.length > 0) {
    console.error("pre-commit: refusing to continue");
    for (const violation of violations) console.error(`  - ${violation}`);
    console.error("  (bypass with `git commit --no-verify`)");
    process.exit(1);
  }

  for (const generator of GENERATORS) {
    execFileSync(generator.command, generator.args, { cwd: ROOT, stdio: "inherit" });
  }

  const changed = GENERATED_PATHS.filter(hasWorktreeEdits);
  if (changed.length > 0) {
    git(["add", "--", ...changed]);
    console.log(`pre-commit: staged regenerated ${changed.join(", ")}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
