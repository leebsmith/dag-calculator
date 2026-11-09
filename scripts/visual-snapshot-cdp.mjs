// Minimal Chrome DevTools Protocol client for the local visual snapshot tool.
// No dependency: Node 24 exposes a global WebSocket. Chrome is a local
// prerequisite; callers treat a missing browser as "skip", never as a failure.

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CHROME_NAMES = ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"];
const READY_TIMEOUT_MS = 10000;
const READY_POLL_MS = 100;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  for (const name of CHROME_NAMES) {
    const result = spawnSync("which", [name], { encoding: "utf8" });
    if (result.status === 0) return result.stdout.trim();
  }
  return null;
}

function launchChrome(executable) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dag-visual-"));
  const proc = spawn(
    executable,
    [
      "--headless=new",
      "--remote-debugging-port=0",
      `--user-data-dir=${dir}`,
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--hide-scrollbars",
      "--no-first-run",
      "--no-default-browser-check",
      "about:blank",
    ],
    { stdio: "ignore" }
  );
  return { proc, dir };
}

async function readEndpoint(dir) {
  const file = path.join(dir, "DevToolsActivePort");
  for (let waited = 0; waited < READY_TIMEOUT_MS; waited += READY_POLL_MS) {
    if (fs.existsSync(file)) {
      const [port, browserPath] = fs.readFileSync(file, "utf8").trim().split("\n");
      return `ws://127.0.0.1:${port}${browserPath}`;
    }
    await sleep(READY_POLL_MS);
  }
  throw new Error("Chrome did not expose DevToolsActivePort");
}

class Cdp {
  constructor(url) {
    if (typeof globalThis.WebSocket !== "function") {
      throw new Error("visual-snapshot needs Node 22+ for the global WebSocket");
    }
    this.ws = new globalThis.WebSocket(url);
    this.next = 1;
    this.pending = new Map();
    this.ready = new Promise((resolve, reject) => {
      this.ws.addEventListener("open", resolve);
      this.ws.addEventListener("error", () => reject(new Error("CDP socket failed")));
    });
    this.ws.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (!message.id || !this.pending.has(message.id)) return;
      const { resolve, reject } = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    });
  }

  async send(method, params = {}, sessionId) {
    await this.ready;
    const id = this.next++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }

  close() {
    this.ws.close();
  }
}

export async function openBrowser() {
  const executable = findChrome();
  if (!executable) return null;
  const { proc, dir } = launchChrome(executable);
  try {
    const cdp = new Cdp(await readEndpoint(dir));
    await cdp.ready;
    return { cdp, proc, dir };
  } catch (error) {
    proc.kill("SIGKILL");
    fs.rmSync(dir, { recursive: true, force: true });
    throw error;
  }
}

export function closeBrowser(browser) {
  try {
    browser.cdp.close();
  } catch {
    /* socket already gone */
  }
  browser.proc.kill("SIGKILL");
  fs.rmSync(browser.dir, { recursive: true, force: true });
}

export async function openPage(browser, { theme, width, height = 900 }) {
  const { targetId } = await browser.cdp.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await browser.cdp.send("Target.attachToTarget", { targetId, flatten: true });
  await browser.cdp.send("Page.enable", {}, sessionId);
  await browser.cdp.send("Runtime.enable", {}, sessionId);
  await browser.cdp.send(
    "Emulation.setDeviceMetricsOverride",
    { width, height, deviceScaleFactor: 1, mobile: false },
    sessionId
  );
  await browser.cdp.send(
    "Emulation.setEmulatedMedia",
    { features: [{ name: "prefers-color-scheme", value: theme === "dark" ? "dark" : "light" }] },
    sessionId
  );
  return { targetId, sessionId };
}

export async function navigate(browser, sessionId, url) {
  await browser.cdp.send("Page.navigate", { url }, sessionId);
  for (let waited = 0; waited < READY_TIMEOUT_MS; waited += READY_POLL_MS) {
    const { result } = await browser.cdp.send(
      "Runtime.evaluate",
      { expression: "document.readyState", returnByValue: true },
      sessionId
    );
    if (result.value === "complete") return;
    await sleep(READY_POLL_MS);
  }
  throw new Error(`page did not settle: ${url}`);
}

export async function evaluate(browser, sessionId, expression) {
  const { result, exceptionDetails } = await browser.cdp.send(
    "Runtime.evaluate",
    { expression, returnByValue: true, awaitPromise: true },
    sessionId
  );
  if (exceptionDetails) throw new Error(exceptionDetails.text ?? "evaluation failed");
  return result.value;
}

export async function screenshot(browser, sessionId) {
  const { data } = await browser.cdp.send(
    "Page.captureScreenshot",
    { format: "png", captureBeyondViewport: true, fromSurface: true },
    sessionId
  );
  return globalThis.Buffer.from(data, "base64");
}

export async function closePage(browser, { targetId }) {
  await browser.cdp.send("Target.closeTarget", { targetId });
}
