// Select the suites a change can reach, and run only those.
//
// `make quick` is `make check` plus this script; `make test` stays the full
// suite. Imports select suites transitively (frontend: relative imports
// resolved and reversed; backend: `app.*` modules). Guards that read a surface
// by path instead of importing it are declared in RULES, and
// tests/guards/test-affected-coupling.test.js fails when a rule names a suite
// or a literal path that no longer exists.
//
// A change set comes from `git diff --name-only <base>` plus untracked files;
// BASE defaults to `main`, `--paths` names one explicitly. Whenever the mapping
// may under-run — a global input, a harness change, a file no suite reaches —
// the lane falls back to its full suite and says why.
//
//   node scripts/test-affected.mjs                 select and run
//   node scripts/test-affected.mjs --dry-run       print the report only
//   BASE=origin/main node scripts/test-affected.mjs
//   node scripts/test-affected.mjs --paths a b c   explicit change set

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, posix } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const FRONTEND_DIRS = ["tests/frontend", "tests/conformance", "tests/guards"];
const BACKEND_DIR = "tests/backend";
const KIND = { mapped: "mapped by imports", coupling: "declared coupling", changed: "changed file" };
const full = (globs, lanes, why) => ({ globs, lanes, full: true, why });
const coupled = (globs, also, why) => ({ globs, lanes: ["frontend"], also, why });

// One entry per coupling rule: the globs that trigger it, the lane it applies
// to, the suites imports cannot select, and why. `full` sends the whole lane.
export const RULES = [
  full(
    ["data/**", "docs/**", "tests/**/*helpers.js", "tests/**/*util.js", "tests/**/*.json"],
    ["frontend", "backend"],
    "a global input the suites read by path; the import map cannot see it"
  ),
  full(
    ["scripts/run-tests.mjs", "scripts/test-affected.mjs", "Makefile", "eslint.config.js"],
    ["frontend", "backend"],
    "the harness decides what runs; mapping a harness change cannot be trusted"
  ),
  full(["frontend/package.json"], ["frontend"], "the frontend's dependencies and build configuration"),
  full(["backend/pyproject.toml", "backend/uv.lock"], ["backend"], "the backend's dependencies"),
  full(
    ["backend/app/core/**", "backend/app/schemas/**", "backend/app/templates/**"],
    ["backend"],
    "core, schemas and templates sit under every boundary test"
  ),
  coupled(
    ["frontend/index.html", "frontend/src/**/*.html", "frontend/src/**/*.css"],
    [
      "alpine-handlers", "control-states", "dialogs", "css-classes", "css-duplication",
      "engine-access", "engine-read-mirrors", "include-integrity", "mash-input-contract",
      "number-input-contract", "select-binding", "show-dereference", "store-surface",
      "svg-length-bindings", "telemetry-classes",
    ],
    "the guards read templates and stylesheets by path, not by import"
  ),
  coupled(["plans/**"], ["docs-claims"], "the claims guard reads every living plan"),
  coupled(
    ["frontend/src/adapters/**"],
    ["ownership", "installer-contract", "alpine-handlers", "store-surface",
      "api-proxy", "engine-read-mirrors"],
    "the guards walk adapters and assert the assembled surface"
  ),
  coupled(
    ["frontend/src/views/**"],
    ["ownership", "presentation-ids", "no-reactivity", "boundary-output-consumers", "engine-read-mirrors"],
    "field models, template bindings and registry readers"
  ),
  coupled(
    ["frontend/src/engine/**"],
    ["ownership", "dimension-coverage", "taxonomy-coverage", "no-reactivity"],
    "grammar coverage follows the interpreter"
  ),
  coupled(
    ["frontend/src/store/**"],
    ["no-reactivity", "store-surface"],
    "the store guards walk the store by path"
  ),
  coupled(
    ["frontend/src/**"],
    ["import-direction", "display-only-units", "engine-access"],
    "these guards read every frontend module by path"
  ),
];

function collect(dir, wanted, out = []) {
  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) collect(path, wanted, out);
    else if (wanted(entry.name)) out.push(path);
  }
  return out;
}

function discover(dir, wanted) {
  try {
    return collect(dir, wanted);
  } catch (error) {
    throw new Error(`cannot read ${dir}: ${error.message}`);
  }
}

export function frontendSuites() {
  return FRONTEND_DIRS.flatMap((dir) => discover(dir, (name) => name.endsWith(".test.js")));
}
export function matches(path, glob) {
  if (!glob.includes("*")) return path === glob;
  const literal = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = glob.split("**").map((part) => part.split("*").map(literal).join("[^/]*")).join(".*");
  return new RegExp(`^${pattern}$`).test(path);
}
function rulesFor(path, lane, key) {
  return RULES.filter(
    (rule) => rule[key] && rule.lanes.includes(lane) && rule.globs.some((glob) => matches(path, glob))
  );
}
function fullHit(paths, lane) {
  for (const path of paths) {
    const [rule] = rulesFor(path, lane, "full");
    if (rule) return `${path} matches ${rule.globs.find((glob) => matches(path, glob))}: ${rule.why}`;
  }
  return null;
}

export function resolveSuite(name, suites) {
  const wanted = `${name}.test.js`;
  return suites.find((file) => file.split("/").pop() === wanted) ?? null;
}

function resolveSpecifier(from, spec) {
  if (!spec.startsWith(".")) return null;
  const base = posix.normalize(posix.join(posix.dirname(from), spec));
  const candidates = [base, `${base}.js`, `${base}/index.js`];
  const found = candidates.find(
    (candidate) => !candidate.startsWith("..") && existsSync(join(ROOT, candidate))
  );
  return found ?? null;
}

function importSpecifiers(file) {
  const source = readFileSync(join(ROOT, file), "utf8");
  const specs = [];
  for (const line of source.split("\n")) {
    const found = /^\s*(?:import|export)\b[^'"]*?["']([^"']+)["']/.exec(line);
    if (found) specs.push(found[1]);
  }
  for (const found of source.matchAll(/\b(?:import|require)\s*\(\s*["']([^"']+)["']\s*\)/g)) {
    specs.push(found[1]);
  }
  return specs;
}

const edgeCache = new Map();

function edges(file) {
  if (!file.endsWith(".js")) return [];
  if (!edgeCache.has(file)) {
    const specs = importSpecifiers(file).map((spec) => resolveSpecifier(file, spec));
    edgeCache.set(file, specs.filter(Boolean));
  }
  return edgeCache.get(file);
}

function closure(start) {
  const seen = new Set();
  const queue = [start];
  while (queue.length > 0) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    queue.push(...edges(file));
  }
  return seen;
}

function frontendIndex(suites) {
  const index = new Map();
  for (const suite of suites) {
    for (const path of closure(suite)) {
      if (!index.has(path)) index.set(path, new Set());
      index.get(path).add(suite);
    }
  }
  return index;
}

function fullSelection(suites, detail) {
  return { suites, entries: suites.map((file) => ({ file, kind: "fallback", detail })), skipped: null };
}

function selectFrontend(changed) {
  const suites = frontendSuites();
  const fallback = fullHit(changed, "frontend");
  if (fallback) return fullSelection(suites, fallback);
  const index = frontendIndex(suites);
  const entries = [];
  const handled = new Set();
  for (const path of changed) {
    for (const rule of rulesFor(path, "frontend", "also")) {
      handled.add(path);
      for (const name of rule.also) {
        const suite = resolveSuite(name, suites);
        if (!suite) throw new Error(`${rule.globs.join(", ")} names ${name}, which has no suite`);
        entries.push({ file: suite, kind: "coupling", detail: rule.why });
      }
    }
    if (suites.includes(path)) {
      handled.add(path);
      entries.push({ file: path, kind: "changed", detail: path });
    }
    for (const suite of index.get(path) ?? []) {
      handled.add(path);
      entries.push({ file: suite, kind: "mapped", detail: path });
    }
  }
  const orphan = changed.find((path) => path.startsWith("frontend/") && !handled.has(path));
  if (orphan) return fullSelection(suites, `${orphan} is reached by no suite`);
  return { suites, entries, skipped: null };
}

function pythonModules() {
  const modules = new Map();
  for (const file of discover("backend/app", (name) => name.endsWith(".py"))) {
    const name = file.slice("backend/".length, -3).replaceAll("/", ".");
    modules.set(name.replace(/\.__init__$/, ""), file);
  }
  return modules;
}

const PY_FROM = /^\s*from\s+([.\w]+)\s+import\s+(.+?)\s*$/;
const PY_IMPORT = /^\s*import\s+([\w.]+)/;

function importedNames(clause) {
  return clause
    .replace(/[()]/g, "")
    .split(",")
    .map((part) => part.trim().split(/\s+as\s+/)[0])
    .filter((name) => /^[A-Za-z_]\w*$/.test(name));
}

function pythonEdges(file, modules) {
  const source = readFileSync(join(ROOT, file), "utf8");
  const found = new Set();
  const add = (name) => {
    const parts = name.split(".");
    for (let index = 1; index <= parts.length; index += 1) {
      const path = modules.get(parts.slice(0, index).join("."));
      if (path) found.add(path);
    }
  };
  for (const line of source.split("\n")) {
    const from = PY_FROM.exec(line);
    if (from && !from[1].startsWith(".")) {
      add(from[1]);
      for (const name of importedNames(from[2])) add(`${from[1]}.${name}`);
      continue;
    }
    const imported = PY_IMPORT.exec(line);
    if (imported) add(imported[1]);
  }
  return [...found];
}

function backendIndex(suites) {
  const modules = pythonModules();
  const cache = new Map();
  const index = new Map();
  for (const suite of suites) {
    const seen = new Set();
    const queue = [suite];
    while (queue.length > 0) {
      const file = queue.pop();
      if (seen.has(file)) continue;
      seen.add(file);
      if (!cache.has(file)) cache.set(file, pythonEdges(file, modules));
      queue.push(...cache.get(file));
    }
    for (const path of seen) {
      if (!index.has(path)) index.set(path, new Set());
      index.get(path).add(suite);
    }
  }
  return index;
}

function selectBackend(changed) {
  const suites = discover(BACKEND_DIR, (name) => /^test_.*\.py$/.test(name));
  const relevant = changed.filter((path) => path.startsWith("backend/") || path.startsWith("data/"));
  if (relevant.length === 0) {
    return { suites, entries: [], skipped: "no backend/** or data/** path changed" };
  }
  const fallback = fullHit(relevant, "backend");
  if (fallback) return fullSelection(suites, fallback);
  const index = backendIndex(suites);
  const entries = [];
  for (const path of relevant) {
    if (suites.includes(path)) {
      entries.push({ file: path, kind: "changed", detail: path });
      continue;
    }
    const hits = index.get(path);
    if (!hits || hits.size === 0) return fullSelection(suites, `${path} is imported by no backend suite`);
    for (const suite of hits) entries.push({ file: suite, kind: "mapped", detail: path });
  }
  return { suites, entries, skipped: null };
}

function summarize(selection) {
  const files = [...new Set(selection.entries.map((entry) => entry.file))].sort();
  const groups = new Map();
  for (const entry of selection.entries) {
    if (!groups.has(entry.kind)) groups.set(entry.kind, { files: new Set(), details: new Set() });
    groups.get(entry.kind).files.add(entry.file);
    groups.get(entry.kind).details.add(entry.detail);
  }
  return { files, groups };
}

function reportLane(label, selection, unit) {
  if (selection.skipped) {
    console.log(`${label}: skipped — ${selection.skipped}`);
    return;
  }
  const { files, groups } = summarize(selection);
  console.log(`${label}: ${files.length} of ${selection.suites.length} ${unit}`);
  const fallback = groups.get("fallback");
  if (fallback) {
    console.log(`  fallback: full ${label} suite — ${[...fallback.details].join("; ")}`);
    return;
  }
  for (const kind of ["mapped", "coupling", "changed"]) {
    const group = groups.get(kind);
    if (group) console.log(`  ${KIND[kind]} (${group.files.size}): ${[...group.files].sort().join(", ")}`);
  }
}

function changedPaths(base) {
  const read = (args) =>
    execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean);
  try {
    const tracked = read(["diff", "--name-only", base]);
    const untracked = read(["ls-files", "--others", "--exclude-standard"]);
    return [...new Set([...tracked, ...untracked])].sort();
  } catch {
    throw new Error(`cannot diff against ${base}; pass BASE=<ref>`);
  }
}

function parseArgs(argv) {
  const options = { base: process.env.BASE || "main", dryRun: argv.includes("--dry-run"), paths: null };
  const rest = argv.filter((arg) => arg !== "--dry-run");
  if (rest.length === 0) return options;
  if (rest[0] !== "--paths") throw new Error(`unknown option ${rest[0]}`);
  options.paths = rest.slice(1);
  if (options.paths.length === 0) throw new Error("--paths needs at least one path");
  return options;
}

function run(command, argv, cwd, count, label) {
  if (count === 0) return 0;
  console.log(`\ntest-affected: running ${count} ${label} suites`);
  const result = spawnSync(command, argv, { cwd, stdio: "inherit" });
  return result.status ?? 1;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const changed = options.paths ?? changedPaths(options.base);
  const scope = options.paths ? "an explicit list" : `against ${options.base}`;
  console.log(`test-affected: ${changed.length} changed paths ${scope}`);
  const frontend = selectFrontend(changed);
  const backend = selectBackend(changed);
  reportLane("frontend", frontend, "suites");
  reportLane("backend", backend, "files");
  if (options.dryRun) {
    console.log("test-affected: dry run; nothing executed");
    return;
  }
  const frontendFiles = summarize(frontend).files;
  const backendFiles = summarize(backend).files;
  const status = Math.max(
    run(process.execPath, ["scripts/run-tests.mjs", "--files", ...frontendFiles], ROOT, frontendFiles.length, "frontend"),
    run("uv", ["run", "pytest", ...backendFiles.map((file) => `../${file}`)], join(ROOT, "backend"), backendFiles.length, "backend")
  );
  if (status !== 0) process.exitCode = 1;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    main();
  } catch (error) {
    console.error(`test-affected: ${error.message}`);
    process.exitCode = 1;
  }
}
