// Regenerate data/sources/manifest.json from the committed raw sources.
//
// Records, per source file: how it was produced (mechanism), its upstream, and a
// content hash + row count. The guard test (tests/guards/sources-manifest) fails
// if a committed source changes without the manifest being regenerated.
//
// Run after any change to data/sources/: `node scripts/emit-sources-manifest.mjs`

import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SOURCES_DIR = fileURLToPath(new URL("../data/sources/", import.meta.url));
const MANIFEST = fileURLToPath(new URL("../data/sources/manifest.json", import.meta.url));

// Provenance metadata (stable; the script computes rows + sha256).
const META = {
  "beer-analytics-hops.json": {
    mechanism: "scrape",
    upstream: "https://www.beer-analytics.com/hops/",
    scraper: "scripts/scrape/hop_scraper.py",
  },
  "beer-analytics-yeasts.json": {
    mechanism: "scrape",
    upstream: "https://www.beer-analytics.com/yeasts/",
    scraper: "scripts/scrape/yeast_scraper.py",
  },
  "bjcp_styles_2015.json": {
    mechanism: "scrape+aggregate",
    upstream: "https://www.bjcp.org/beer-styles/beer-style-guidelines/",
    scraper: "scripts/scrape/bjcp/scrape_bjcp.py",
    aggregator: "scripts/scrape/bjcp/aggregator.py",
    edition: 2015,
  },
  "bjcp_styles_2021.json": {
    mechanism: "scrape+aggregate",
    upstream: "https://www.bjcp.org/beer-styles/beer-style-guidelines/",
    scraper: "scripts/scrape/bjcp/scrape_bjcp.py",
    aggregator: "scripts/scrape/bjcp/aggregator.py",
    edition: 2021,
  },
  "malt-database-malts.json": {
    mechanism: "scrape",
    upstream: "malt_database (local scrape)",
  },
  "standard-malts.json": {
    mechanism: "vendor+extend",
    upstream: "malt_database standard_malts.tsv (extended)",
    scraper: "scripts/vendor-standard-malts.py",
  },
};

export function buildSourcesManifest() {
  const files = readdirSync(SOURCES_DIR)
    .filter((file) => file.endsWith(".json") && file !== "manifest.json")
    .sort();

  const sources = {};
  for (const file of files) {
    const raw = readFileSync(`${SOURCES_DIR}${file}`, "utf8");
    const data = JSON.parse(raw);
    sources[file] = {
      ...(META[file] ?? { mechanism: "unknown" }),
      rows: Array.isArray(data) ? data.length : Object.keys(data).length,
      sha256: createHash("sha256").update(raw).digest("hex"),
    };
  }
  return { sources };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(MANIFEST, `${JSON.stringify(buildSourcesManifest(), null, 2)}\n`);
  console.log("wrote data/sources/manifest.json");
}
