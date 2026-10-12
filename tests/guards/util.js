// Shared helpers for anti-drift guards.
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

export const ROOT = new URL("../../", import.meta.url).pathname; // repo root

export function walk(dir, exts) {
  const out = [];
  (function rec(d) {
    for (const entry of readdirSync(d)) {
      const p = join(d, entry);
      if (statSync(p).isDirectory()) rec(p);
      else if (exts.some((x) => p.endsWith(x))) out.push(p);
    }
  })(join(ROOT, dir));
  return out;
}

export function read(p) {
  return readFileSync(join(ROOT, p), "utf8");
}

export function rel(abs) {
  return abs.replace(ROOT, "");
}

export function artifact() {
  return JSON.parse(read("data/artifact.json"));
}

export { existsSync, join };
