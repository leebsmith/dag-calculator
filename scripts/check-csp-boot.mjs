// Boot the built SPA under the production CSP and fail on any script error.
//
// The CSP build swaps expression evaluation for a parser; a construct it cannot
// parse throws at render time, not at build time. This is the only check that
// exercises that class of failure end to end. Local-only (needs a Chrome
// binary), like `test-visual`: print a skip and exit 0 when none is found.
//
// Two boots: the sign-in sheet (no data) and the authenticated shell, with a
// stubbed Firebase user and API so the landing page materializes. The second
// one is where the modal shells live — a `data-shell` that resolves to nothing
// leaves a backdrop behind and aborts the rest of the tree.
//
//   make test-csp-boot        # builds with placeholder Firebase config, then probes

import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const DIST = join(ROOT, "frontend/dist");
const FIREBASE_CONFIG = join(ROOT, "firebase.json");
const CHROME_CANDIDATES = ["google-chrome", "chromium", "chromium-browser"];
const PROBLEM_LIMIT = 5;
const BOOT_WAIT_MS = 6000;
const LANDING_POLL_MS = 200;

// Signed-in boot: a stubbed Firebase user and a stubbed JSON seam. `applyAuth`
// publishes the user in a `finally`, so the landing page paints even when a
// surface read fails — but a 404 from the static server would be a console
// error, so every seam answers with its empty shape.
const AUTH_STUB = `(() => {
  const user = {
    uid: "csp-boot",
    email: "csp-boot@example.test",
    displayName: "CSP boot",
    getIdToken: async () => "token",
  };
  const noop = () => {};
  const GoogleAuthProvider = function () {
    this.setCustomParameters = noop;
  };
  const authApi = {
    currentUser: user,
    initializeApp: () => ({}),
    onAuthStateChanged: (callback) => {
      setTimeout(() => callback(user), 50);
      return noop;
    },
    getRedirectResult: async () => null,
    signInWithPopup: async () => ({ user }),
    signInWithRedirect: async () => null,
    signOut: async () => null,
    useEmulator: noop,
    GoogleAuthProvider,
  };
  const sdk = { initializeApp: authApi.initializeApp, auth: () => authApi, GoogleAuthProvider };
  Object.defineProperty(window, "firebase", { configurable: true, get: () => sdk, set: noop });
  const json = (body) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : (input?.url ?? "");
    if (!url.startsWith("/")) return realFetch(input, init);
    if (url.startsWith("/session")) return json({ allowed: true, email: user.email });
    if (url.startsWith("/solve/")) return json({});
    return json([]);
  };
})();`;

const TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

function fail(message) {
  console.error(`csp boot: ${message}`);
  process.exitCode = 1;
}

function cspHeader() {
  const config = JSON.parse(readFileSync(FIREBASE_CONFIG, "utf8"));
  const entry = (config.hosting?.headers ?? [])
    .filter((header) => header.source === "**")
    .flatMap((header) => header.headers ?? [])
    .find((header) => header.key === "Content-Security-Policy");
  if (!entry?.value) {
    fail('firebase.json has no Content-Security-Policy for "**"');
    return null;
  }
  if (entry.value.includes("'unsafe-eval'")) {
    fail("the production CSP still allows 'unsafe-eval'");
    return null;
  }
  return entry.value;
}

function whichBinary(name) {
  for (const path of (process.env.PATH ?? "").split(":")) {
    const candidate = join(path, name);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function chromeBinary() {
  for (const name of CHROME_CANDIDATES) {
    const found = whichBinary(name);
    if (found) return found;
  }
  return null;
}

// The signed-in boot replaces the CDN Firebase SDK with a stub, so the document
// it loads drops the two compat <script> tags; the app's own module still reads
// `globalThis.firebase`, which the stub owns.
function withoutFirebaseScripts(html) {
  return html.replace(
    /<script\s[^>]*src="https:\/\/www\.gstatic\.com\/firebasejs\/[^"]*"[^>]*><\/script>/g,
    ""
  );
}

function serve(csp) {
  return new Promise((resolve) => {
    const server = createServer((request, response) => {
      const [requested, query = ""] = (request.url ?? "/").split("?");
      const relative = requested === "/" ? "/index.html" : requested;
      const file = join(DIST, relative);
      const target = existsSync(file) ? file : join(DIST, "index.html");
      const contents = readFileSync(target);
      const body =
        query.includes("stub-auth") && target.endsWith(".html")
          ? withoutFirebaseScripts(contents.toString("utf8"))
          : contents;
      response.writeHead(200, {
        "Content-Type": TYPES[extname(target)] ?? "application/octet-stream",
        "Content-Security-Policy": csp,
      });
      response.end(body);
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

async function waitForJson(url, deadlineMs) {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    try {
      const response = await globalThis.fetch(url);
      if (response.ok) return response.json();
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return null;
}

async function openSession(debuggingPort) {
  const target = await (
    await globalThis.fetch(`http://127.0.0.1:${debuggingPort}/json/new?about:blank`, {
      method: "PUT",
    })
  ).json();
  const socket = new globalThis.WebSocket(target.webSocketDebuggerUrl);
  const pending = new Map();
  const problems = [];
  let nextId = 1;
  const send = (method, params = {}) => {
    const id = nextId++;
    socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve) => pending.set(id, resolve));
  };
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message.result);
      pending.delete(message.id);
      return;
    }
    if (message.method === "Runtime.exceptionThrown") {
      const details = message.params.exceptionDetails;
      problems.push(details.exception?.description ?? details.text);
    }
    if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") {
      problems.push(
        message.params.args.map((argument) => argument.value ?? argument.description).join(" ")
      );
    }
  };
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = () => reject(new Error("debugging socket failed"));
  });
  return { socket, send, problems };
}

async function evaluate(send, expression) {
  const result = await send("Runtime.evaluate", { expression, returnByValue: true });
  return result?.result?.value;
}

async function waitForLanding(send, deadlineMs) {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    const landed = await evaluate(send, `Boolean(document.querySelector(".chooser"))`);
    if (landed) return true;
    await new Promise((resolve) => setTimeout(resolve, LANDING_POLL_MS));
  }
  return false;
}

async function probe(chrome, origin) {
  const profile = mkdtempSync(join(tmpdir(), "csp-boot-"));
  const debuggingPort = 9300 + Math.floor(Math.random() * 300);
  const child = spawn(
    chrome,
    [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      `--remote-debugging-port=${debuggingPort}`,
      `--user-data-dir=${profile}`,
      "about:blank",
    ],
    { stdio: "ignore" }
  );

  try {
    const version = await waitForJson(`http://127.0.0.1:${debuggingPort}/json/version`, 15000);
    if (!version) {
      fail("headless Chrome did not expose the debugging port");
      return;
    }
    const { socket, send, problems } = await openSession(debuggingPort);
    await send("Runtime.enable");
    await send("Page.enable");
    await send("Page.addScriptToEvaluateOnNewDocument", {
      source: `window.__cspViolations = [];
        document.addEventListener("securitypolicyviolation", (event) => {
          window.__cspViolations.push(event.violatedDirective + " " + event.blockedURI);
        });`,
    });
    await send("Page.navigate", { url: origin });
    await new Promise((resolve) => setTimeout(resolve, BOOT_WAIT_MS));

    const state = await send("Runtime.evaluate", {
      expression: `JSON.stringify({
        shell: Boolean(document.querySelector("main.app-shell")),
        signIn: document.body.innerText.includes("Sign in with Google"),
        violations: window.__cspViolations ?? []
      })`,
      returnByValue: true,
    });
    assertState(JSON.parse(state.result?.value ?? "{}"), problems);

    const signedOutProblems = problems.length;
    await send("Page.addScriptToEvaluateOnNewDocument", { source: AUTH_STUB });
    await send("Page.navigate", { url: `${origin}?stub-auth=1` });
    const landed = await waitForLanding(send, BOOT_WAIT_MS * 2);
    const signedIn = await evaluate(
      send,
      `JSON.stringify({
        shell: Boolean(document.querySelector("main.app-shell")),
        violations: window.__cspViolations ?? [],
        visibleBackdrops: [...document.querySelectorAll(".modal-backdrop")]
          .filter((element) => getComputedStyle(element).display !== "none").length,
        defaultedShells: document.querySelectorAll("#modal-body, #modal-overlay").length,
        shells: document.querySelectorAll("[data-shell]").length,
        scopedShells: [...document.querySelectorAll("[data-shell]")]
          .filter((element) => window.Alpine?.$data?.(element)).length,
        newBatchBody: (document.querySelector("#new-batch-body")?.textContent ?? "").trim().length,
        reportPickerBody: Boolean(document.querySelector("#report-picker-body"))
      })`
    );
    assertAuthenticatedState(
      { landed, ...JSON.parse(signedIn ?? "{}") },
      problems.slice(signedOutProblems)
    );
    socket.close();
  } finally {
    child.kill("SIGKILL");
    rmSync(profile, { recursive: true, force: true });
  }
}

function assertState(state, problems) {
  if (!state.shell) fail("the app shell did not render");
  if (!state.signIn) fail("the sign-in sheet did not render");
  for (const violation of state.violations ?? []) fail(`CSP violation: ${violation}`);
  for (const problem of problems.slice(0, PROBLEM_LIMIT)) fail(`console error: ${problem}`);
}

function assertAuthenticatedState(state, problems) {
  if (!state.shell) fail("signed in: the app shell did not render");
  if (!state.landed) fail("signed in: the landing page did not render");
  if (state.visibleBackdrops > 0) {
    fail(`signed in: ${state.visibleBackdrops} modal backdrop(s) visible with no open modal`);
  }
  if (state.defaultedShells > 0) {
    fail(
      `signed in: ${state.defaultedShells} modal shell(s) fell back to the default id; a data-shell did not resolve`
    );
  }
  if (state.shells === 0 || state.scopedShells !== state.shells) {
    fail(
      `signed in: ${state.shells - state.scopedShells} of ${state.shells} modal shell(s) have no Alpine scope`
    );
  }
  if (state.newBatchBody === 0) {
    fail("signed in: the New batch dialog body is empty; its teleport did not land");
  }
  if (!state.reportPickerBody) {
    fail("signed in: the report picker body slot is missing; its config did not resolve");
  }
  for (const violation of state.violations ?? []) fail(`signed in: CSP violation: ${violation}`);
  for (const problem of problems.slice(0, PROBLEM_LIMIT)) fail(`signed in: console error: ${problem}`);
}

async function main() {
  if (!existsSync(join(DIST, "index.html"))) {
    fail("frontend/dist is missing; run `make build` first");
    return;
  }
  const csp = cspHeader();
  if (!csp) return;

  const chrome = chromeBinary();
  if (!chrome) {
    console.log("csp boot: skipped (no Chrome binary on PATH)");
    return;
  }

  const server = await serve(csp);
  const { port } = server.address();
  try {
    await probe(chrome, `http://127.0.0.1:${port}/`);
  } finally {
    server.close();
  }
  if (!process.exitCode) console.log("csp boot: shell and landing rendered under the production CSP");
}

main().catch((error) => fail(error.message));
