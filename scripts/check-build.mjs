import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const DIST = fileURLToPath(new URL("../frontend/dist/", import.meta.url));

function fail(message) {
  console.error(`build check: ${message}`);
  process.exitCode = 1;
}

const indexPath = `${DIST}index.html`;
if (!existsSync(indexPath)) {
  fail("frontend/dist/index.html missing - run `make build`");
} else {
  const html = readFileSync(indexPath, "utf8");
  if (/<load\s+src=/.test(html)) fail("unresolved <load src> include in index.html");

  const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
    .map((match) => match[1])
    .filter((ref) => ref.startsWith("/assets/") || ref.startsWith("./assets/"));

  if (refs.length === 0) fail("index.html references no built assets");

  for (const ref of refs) {
    const rel = ref.replace(/^\.?\//, "");
    if (!existsSync(`${DIST}${rel}`)) fail(`missing built asset ${rel}`);
  }

  if (!process.exitCode) console.log(`build check: ${refs.length} assets referenced`);

  // Every gstatic.com SDK script must be SRI-pinned and deferred.
  const scripts = [...html.matchAll(/<script\b([^>]*)>/g)].map((m) => m[1]);
  for (const attrs of scripts) {
    const src = (attrs.match(/\bsrc="([^"]+)"/) ?? [])[1];
    if (!src || !src.includes("gstatic.com")) continue;
    if (!/\bintegrity="sha384-/.test(attrs)) fail(`gstatic script missing integrity: ${src}`);
    if (!/\bdefer\b/.test(attrs)) fail(`gstatic script missing defer: ${src}`);
    if (!/\bcrossorigin="anonymous"/.test(attrs)) fail(`gstatic script missing crossorigin: ${src}`);
  }
}

// A production bundle must not ship the dev/emulator API-key fallback.
const assetsDir = `${DIST}assets/`;
if (existsSync(assetsDir)) {
  const leaked = readdirSync(assetsDir)
    .filter((name) => name.endsWith(".js"))
    .filter((name) => readFileSync(`${assetsDir}${name}`, "utf8").includes("demo-api-key"));
  if (leaked.length) fail(`production bundle contains demo-api-key: ${leaked.join(", ")}`);
}
