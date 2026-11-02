import { existsSync, readFileSync } from "node:fs";

// Structural verification for the Firebase hardening config (PR 1):
//   firestore.rules            — deny-all client access
//   firebase.json              — firestore rules binding + hosting block
//   hosting headers            — SPA cache strategy + enforced CSP
// Wired into `make check` (and therefore `make verify`).

const ROOT = new URL("../", import.meta.url);
const read = (rel) => readFileSync(new URL(rel, ROOT), "utf8");

const failures = [];
function fail(message) {
  failures.push(message);
}

function hasRewrite(rewrites) {
  return Array.isArray(rewrites) && rewrites.some(
    (r) => r?.source === "**" && r?.destination === "/index.html"
  );
}

// D8: production is same-origin. Every API prefix is a Cloud Run rewrite that
// must precede the SPA catch-all, and its service/region must match the
// Makefile's deploy target. `/health` stays off Hosting.
const API_SOURCES = [
  "/solve/**",
  "/batches/**",
  "/brew-sessions/**",
  "/catalog/**",
  "/report/**",
  "/session",
];

function deployTargets() {
  const makefile = read("Makefile");
  return {
    service: makefile.match(/^CLOUD_RUN_SERVICE\s*:=\s*(\S+)/m)?.[1],
    region: makefile.match(/^CLOUD_RUN_REGION\s*:=\s*(\S+)/m)?.[1],
  };
}

function checkApiRewrite(source, entry, spaIndex, index, { service, region }) {
  if (index === -1) {
    fail(`hosting.rewrites must proxy ${source} to Cloud Run`);
    return;
  }
  if (spaIndex !== -1 && index > spaIndex) {
    fail(`${source} rewrite must precede the SPA catch-all`);
  }
  if (entry?.run?.serviceId !== service) {
    fail(`${source} rewrite serviceId must match CLOUD_RUN_SERVICE (${service})`);
  }
  if (entry?.run?.region !== region) {
    fail(`${source} rewrite region must match CLOUD_RUN_REGION (${region})`);
  }
}

function checkApiRewrites(rewrites) {
  const list = Array.isArray(rewrites) ? rewrites : [];
  const spaIndex = list.findIndex(
    (r) => r?.source === "**" && r?.destination === "/index.html"
  );
  const targets = deployTargets();
  if (!targets.service || !targets.region) {
    fail("Makefile must declare CLOUD_RUN_SERVICE and CLOUD_RUN_REGION");
  }
  for (const source of API_SOURCES) {
    const index = list.findIndex((r) => r?.source === source);
    checkApiRewrite(source, list[index], spaIndex, index, targets);
  }
  if (list.some((r) => r?.source === "/health")) {
    fail("/health must not be exposed through Hosting");
  }
}

function headersFor(config, source) {
  const entry = (config.hosting?.headers ?? []).find((h) => h.source === source);
  const out = {};
  for (const h of entry?.headers ?? []) out[h.key] = h.value;
  return out;
}

// --- firestore.rules ------------------------------------------------------
const rulesPath = new URL("firestore.rules", ROOT);
if (!existsSync(rulesPath)) {
  fail("firestore.rules missing");
} else {
  const rules = read("firestore.rules");
  if (!/rules_version\s*=\s*'2'/.test(rules)) fail("firestore.rules must declare rules_version = '2'");
  if (!/match \/\{document=\*\*\}/.test(rules)) fail("firestore.rules must match /{document=**}");
  if (!/allow read, write: if false/.test(rules)) fail("firestore.rules must deny all read/write");
}

// --- firebase.json --------------------------------------------------------
let config;
if (!existsSync(new URL("firebase.json", ROOT))) {
  fail("firebase.json missing");
  config = {};
} else {
  try {
    config = JSON.parse(read("firebase.json"));
  } catch (err) {
    fail(`firebase.json is not valid JSON: ${err.message}`);
    config = {};
  }
}

if (config.firestore?.rules !== "firestore.rules") {
  fail('firebase.json must bind "firestore.rules" via firestore.rules');
}
if (!existsSync(new URL(config.firestore?.rules ?? "", ROOT))) {
  fail("the rules file named by firebase.json does not exist");
}

const hosting = config.hosting ?? {};
if (hosting.public !== "frontend/dist") {
  fail('firebase.json hosting.public must be "frontend/dist"');
}
if (!hasRewrite(hosting.rewrites)) {
  fail('firebase.json hosting.rewrites must contain { source: "**", destination: "/index.html" }');
}
checkApiRewrites(hosting.rewrites);

const indexHeaders = headersFor(config, "/index.html");
if (indexHeaders["Cache-Control"] !== "no-cache") {
  fail('firebase.json must send Cache-Control: no-cache for /index.html');
}

const assetHeaders = headersFor(config, "assets/**");
if (!/immutable/.test(assetHeaders["Cache-Control"] ?? "")) {
  fail('firebase.json must send an immutable Cache-Control for assets/**');
}

const csp = headersFor(config, "**")["Content-Security-Policy"];
if (!csp) {
  fail('firebase.json must set a Content-Security-Policy header for "**"');
} else {
  const required = [
    "default-src 'self'",
    "script-src 'self'",
    "https://www.gstatic.com",
    "connect-src 'self'",
    "frame-src 'self'",
  ];
  for (const fragment of required) {
    if (!csp.includes(fragment)) fail(`CSP missing directive fragment: ${fragment}`);
  }
  if (csp.includes("Content-Security-Policy ")) fail("CSP header appears malformed");
}

// --- report ---------------------------------------------------------------
if (failures.length) {
  for (const message of failures) console.error(`firebase config: ${message}`);
  process.exitCode = 1;
} else {
  console.log("firebase config: rules + hosting + enforced CSP validated");
}
