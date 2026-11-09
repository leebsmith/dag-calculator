// Local visual snapshot tool: compare the container markup and stylesheet
// between a git ref and the working tree. Chrome is optional; without it the
// tool prints a skip and exits 0. This is deliberately outside `make test` and
// CI: computed styles and pixels are machine-dependent.
//
//   node scripts/visual-snapshot.mjs
//   node scripts/visual-snapshot.mjs --base main --themes light,dark
//   node scripts/visual-snapshot.mjs --check   # exit 1 on any diff
//   make test-visual BASE=<ref>
//
// Outputs land in `.local/visual/` (gitignored): fixtures, snapshots, diffs and
// before/after screenshots for the selected partials.

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  closeBrowser,
  closePage,
  evaluate,
  navigate,
  openBrowser,
  openPage,
  screenshot,
} from "./visual-snapshot-cdp.mjs";

const DEFAULT_SCREENS = [
  "step-hops.html",
  "step-water.html",
  "library.html",
  "import-transcribe.html",
  "modal-malt-editor.html",
];

export const SNAPSHOT_PROPS = [
  "display", "position", "top", "right", "bottom", "left",
  "width", "height", "min-width", "max-width", "min-height", "max-height",
  "margin-top", "margin-right", "margin-bottom", "margin-left",
  "padding-top", "padding-right", "padding-bottom", "padding-left",
  "gap", "row-gap", "column-gap",
  "background-color", "background-image",
  "border-top-width", "border-right-width", "border-bottom-width", "border-left-width",
  "border-top-style", "border-right-style", "border-bottom-style", "border-left-style",
  "border-top-color", "border-right-color", "border-bottom-color", "border-left-color",
  "border-top-left-radius", "border-top-right-radius", "border-bottom-right-radius", "border-bottom-left-radius",
  "box-shadow", "color", "font-size", "font-weight", "font-family", "line-height",
  "letter-spacing", "text-transform", "white-space",
  "overflow-x", "overflow-y", "opacity", "z-index",
  "flex-direction", "flex-wrap", "flex-grow", "flex-shrink", "flex-basis",
  "align-items", "align-self", "justify-content",
  "grid-template-columns", "grid-template-rows", "grid-column", "grid-row",
  "container-type", "transform",
];

export const SNAPSHOT_EXPRESSION = `(() => {
  const props = ${JSON.stringify(SNAPSHOT_PROPS)};
  const roots = [...document.querySelectorAll("[data-fixture-file]")];
  return roots.map((root) => {
    const origin = root.getBoundingClientRect();
    return {
      file: root.dataset.fixtureFile,
      elements: [root, ...root.querySelectorAll("*")].map((el, index) => {
        const style = getComputedStyle(el);
        const values = {};
        for (const prop of props) values[prop] = style.getPropertyValue(prop);
        const rect = el.getBoundingClientRect();
        return {
          index,
          props: values,
          rect: [rect.x - origin.x, rect.y - origin.y, rect.width, rect.height],
        };
      }),
    };
  });
})()`;

export function stripAlpine(source) {
  return source
    .replace(/\s+@[A-Za-z0-9_.:-]+="[^"]*"/g, "")
    .replace(/\s+:[A-Za-z0-9_.:-]+="[^"]*"/g, "")
    .replace(/\s+x-[A-Za-z0-9_.:-]+="[^"]*"/g, "")
    .replace(/\s+x-[A-Za-z0-9_.:-]+='[^']*'/g, "")
    .replace(/\s+x-cloak\b/g, "")
    .replace(/<template\b[^>]*>/g, "")
    .replace(/<\/template>/g, "");
}

function loadName(src) {
  return src.replace(/^\.?\//, "").replace(/^src\/partials\//, "");
}

export function inlineLoads(source, { partialsDir, depth = 0 }) {
  if (depth > 8) return source;
  return source.replace(
    /<load\b[^>]*?src="([^"]+)"[^>]*?\/?>(?:<\/load>)?/g,
    (_match, src) => {
      const file = path.join(partialsDir, loadName(src));
      if (!fs.existsSync(file)) return `<!-- missing: ${src} -->`;
      return inlineLoads(stripAlpine(fs.readFileSync(file, "utf8")), {
        partialsDir,
        depth: depth + 1,
      });
    }
  );
}

export function buildFixture({ css, partialsDir, files, theme }) {
  const sections = files.map((file) => {
    const raw = stripAlpine(fs.readFileSync(path.join(partialsDir, file), "utf8"));
    return `<section data-fixture-file="${file}">${inlineLoads(raw, { partialsDir })}</section>`;
  });
  return `<!doctype html>
<html lang="en" data-theme="${theme}">
<head><meta charset="utf-8"><title>visual fixture</title>
<style>${css}
*, *::before, *::after { animation: none !important; transition: none !important; }
</style></head>
<body><main class="app-shell"><div class="app-content">${sections.join("\n")}</div></main></body>
</html>`;
}

export function compareSnapshots(before, after) {
  const diffs = [];
  const beforeByFile = new Map(before.map((file) => [file.file, file]));
  let compared = 0;
  for (const afterFile of after) {
    const beforeFile = beforeByFile.get(afterFile.file);
    if (!beforeFile) {
      diffs.push(`${afterFile.file}: missing from before`);
      continue;
    }
    if (beforeFile.elements.length !== afterFile.elements.length) {
      diffs.push(`${afterFile.file}: element count ${beforeFile.elements.length} -> ${afterFile.elements.length}`);
      continue;
    }
    for (let index = 0; index < beforeFile.elements.length; index++) {
      const a = beforeFile.elements[index];
      const b = afterFile.elements[index];
      compared++;
      for (const prop of Object.keys(a.props)) {
        if (a.props[prop] !== b.props[prop]) {
          diffs.push(`${afterFile.file}[${index}] ${prop}: ${a.props[prop]} -> ${b.props[prop]}`);
        }
      }
      for (let corner = 0; corner < 4; corner++) {
        if (Math.abs(a.rect[corner] - b.rect[corner]) > 0.01) {
          diffs.push(`${afterFile.file}[${index}] rect[${corner}]: ${a.rect[corner]} -> ${b.rect[corner]}`);
        }
      }
    }
  }
  return { compared, diffs };
}

function materializeBase(ref, dir) {
  const archive = execFileSync(
    "git",
    ["archive", "--format=tar", ref, "frontend/src/style.css", "frontend/src/partials"],
    { maxBuffer: 64 * 1024 * 1024 }
  );
  const result = spawnSync("tar", ["-x", "-C", dir], { input: archive });
  if (result.status !== 0) throw new Error(`could not extract ${ref}`);
  return {
    style: path.join(dir, "frontend/src/style.css"),
    partials: path.join(dir, "frontend/src/partials"),
  };
}

function listPartials(dir) {
  return fs.readdirSync(dir).filter((file) => file.endsWith(".html")).sort();
}

async function snapshot(browser, fixture, theme, width) {
  const page = await openPage(browser, { theme, width });
  try {
    await navigate(browser, page.sessionId, pathToFileURL(fixture).href);
    return await evaluate(browser, page.sessionId, SNAPSHOT_EXPRESSION);
  } finally {
    await closePage(browser, page);
  }
}

async function captureScreenshot(browser, fixture, theme, width, target) {
  const page = await openPage(browser, { theme, width });
  try {
    await navigate(browser, page.sessionId, pathToFileURL(fixture).href);
    fs.writeFileSync(target, await screenshot(browser, page.sessionId));
  } finally {
    await closePage(browser, page);
  }
}

function writeFixture(target, tree, files, theme) {
  fs.writeFileSync(
    target,
    buildFixture({ css: fs.readFileSync(tree.style, "utf8"), partialsDir: tree.partials, files, theme })
  );
  return target;
}

function parseArgs(argv) {
  const options = {
    base: "main",
    themes: ["light", "dark"],
    widths: [1280, 600],
    out: ".local/visual",
    screenshots: true,
    check: false,
  };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--base") options.base = argv[++index];
    else if (arg === "--themes") options.themes = argv[++index].split(",");
    else if (arg === "--widths") options.widths = argv[++index].split(",").map(Number);
    else if (arg === "--out") options.out = argv[++index];
    else if (arg === "--no-screenshots") options.screenshots = false;
    else if (arg === "--check") options.check = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (!options.themes.every((theme) => theme === "light" || theme === "dark")) {
    throw new Error("themes must be light or dark");
  }
  if (!options.widths.every((width) => Number.isFinite(width) && width > 0)) {
    throw new Error("widths must be positive numbers");
  }
  return options;
}

async function runSnapshots({ browser, options, before, after, baseDir, outDir }) {
  const beforeFiles = listPartials(before.partials);
  const afterFiles = listPartials(after.partials);
  const files = [...new Set([...beforeFiles, ...afterFiles])].sort();
  const results = [];
  for (const theme of options.themes) {
    const beforeFixture = writeFixture(path.join(baseDir, `fixture-${theme}.html`), before, beforeFiles, theme);
    const afterFixture = writeFixture(path.join(outDir, `fixture-${theme}.html`), after, afterFiles, theme);
    for (const width of options.widths) {
      const beforeSnap = await snapshot(browser, beforeFixture, theme, width);
      const afterSnap = await snapshot(browser, afterFixture, theme, width);
      fs.writeFileSync(
        path.join(outDir, `snapshot-before-${theme}-${width}.json`),
        JSON.stringify(beforeSnap)
      );
      fs.writeFileSync(
        path.join(outDir, `snapshot-after-${theme}-${width}.json`),
        JSON.stringify(afterSnap)
      );
      const result = compareSnapshots(beforeSnap, afterSnap);
      const report = { theme, width, files: files.length, compared: result.compared, count: result.diffs.length, diffs: result.diffs.slice(0, 500) };
      fs.writeFileSync(path.join(outDir, `diff-${theme}-${width}.json`), JSON.stringify(report, null, 2));
      results.push(report);
      console.log(`  ${theme} ${width}px: ${result.compared} elements, ${result.diffs.length} diff(s)`);
    }
  }
  return results;
}

async function runScreenshots({ browser, options, before, after, baseDir, outDir }) {
  const beforeFiles = new Set(listPartials(before.partials));
  const afterFiles = new Set(listPartials(after.partials));
  for (const theme of options.themes) {
    for (const file of DEFAULT_SCREENS) {
      if (!beforeFiles.has(file) || !afterFiles.has(file)) continue;
      const beforeFixture = writeFixture(path.join(baseDir, `screen-before-${theme}-${file}.html`), before, [file], theme);
      const afterFixture = writeFixture(path.join(outDir, `screen-after-${theme}-${file}.html`), after, [file], theme);
      await captureScreenshot(browser, beforeFixture, theme, 1280, path.join(outDir, `before-${theme}-${file}.png`));
      await captureScreenshot(browser, afterFixture, theme, 1280, path.join(outDir, `after-${theme}-${file}.png`));
    }
  }
  console.log(`  screenshots: ${DEFAULT_SCREENS.length * options.themes.length * 2} image(s)`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const repo = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
  const outDir = path.resolve(repo, options.out);
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "dag-visual-base-"));
  fs.mkdirSync(outDir, { recursive: true });

  let browser = null;
  try {
    const before = materializeBase(options.base, baseDir);
    const after = {
      style: path.join(repo, "frontend/src/style.css"),
      partials: path.join(repo, "frontend/src/partials"),
    };
    browser = await openBrowser();
    if (!browser) {
      console.log("visual-snapshot: Chrome not found; skipped (set CHROME to override)");
      return 0;
    }
    console.log(`visual-snapshot: ${options.base} -> working tree`);
    const context = { browser, options, before, after, baseDir, outDir };
    const results = await runSnapshots(context);
    if (options.screenshots) {
      await runScreenshots(context);
    }
    const total = results.reduce((sum, result) => sum + result.count, 0);
    console.log(`  output: ${path.relative(repo, outDir)}`);
    if (options.check && total > 0) {
      console.error(`visual-snapshot: ${total} diff(s) outside --check`);
      return 1;
    }
    return 0;
  } finally {
    if (browser) closeBrowser(browser);
    fs.rmSync(baseDir, { recursive: true, force: true });
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      console.error(`visual-snapshot: ${error.stack ?? error.message}`);
      process.exitCode = 1;
    }
  );
}
