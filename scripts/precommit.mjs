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
    name: "report format vector",
    command: process.execPath,
    args: ["scripts/emit-report-format-vector.mjs"],
    outputs: ["tests/conformance/fixtures/report-format-vector.json"],
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

export function findViolations({ staged, dirtyGenerated = [] }) {
  const stagedSet = new Set(staged);
  const violations = [];

  for (const path of staged) {
    if (LIVING_EXCEPTIONS.has(path)) continue;
    const frozen = FROZEN_PREFIXES.find((prefix) => path.startsWith(prefix));
    if (frozen) {
      violations.push(
        `${path} is under ${frozen}, which is frozen (see AGENTS.md); use --no-verify only if this is intentional`
      );
    }
  }

  if (stagedSet.has(ARTIFACT) && !stagedSet.has(ARTIFACT_FIXTURE)) {
    violations.push(
      `${ARTIFACT} is staged but ${ARTIFACT_FIXTURE} is not — run \`make generate\``
    );
  }

  for (const [manifest, lock] of LOCK_PAIRS) {
    if (stagedSet.has(manifest) && !stagedSet.has(lock)) {
      violations.push(`${manifest} is staged but ${lock} is not — regenerate the lockfile`);
    }
  }

  for (const path of dirtyGenerated) {
    violations.push(
      `${path} has unstaged edits; refusing to regenerate over them — stage or discard them first`
    );
  }

  return violations;
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

function main() {
  const staged = stagedPaths();
  const dirtyGenerated = GENERATED_PATHS.filter(hasWorktreeEdits);
  const violations = findViolations({ staged, dirtyGenerated });

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
