import { existsSync, readFileSync } from "node:fs";
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
}
