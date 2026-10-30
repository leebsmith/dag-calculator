// Local dev supervisor: starts Vite, the Firebase emulators and Uvicorn, and
// snapshots the emulators every few minutes and on the way down.
//
// A terminal Ctrl+C signals the whole foreground process group, which kills the
// Firestore emulator before its own --export-on-exit can run. This process
// starts the emulators in their own process group, so the interrupt arrives
// here only, exports while they are still alive, and only then stops them.
//
// The ports are preflighted before anything spawns. A stale session holding one
// makes a child exit immediately, and an exit here is a shutdown: that shutdown
// used to fire its export request at an emulator still importing, so a busy port
// surfaced as a Firestore export failure that named none of it.

import { execFileSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { clearInterval, clearTimeout, setInterval, setTimeout } from "node:timers";

import { LOCAL_PORTS, busyMessage, listening, owners } from "./local-ports.mjs";

const PROJECT = process.env.FIREBASE_PROJECT_ID ?? "dag-calculator";
const DATA = "emulator-data";
const METADATA = `${DATA}/firebase-export-metadata.json`;
const SAVE_MINUTES = Number(process.env.SAVE_INTERVAL_MINUTES ?? 5);
const EMULATOR_PORTS = [8080, 9099];
const READY_POLL_MS = 500;
const STOP_GRACE_MS = 5000;
const EXIT_DEADLINE_MS = 15_000;

const children = [];
let stopping = false;
let timer = null;
let readyPoll = null;
let emulatorsReady = false;
let failure = null;

const stopCode = () => (failure ? 1 : 0);

function running({ child }) {
  return child.exitCode === null && child.signalCode === null;
}

function start(name, command, args, options = {}) {
  const child = spawn(command, args, { stdio: "inherit", detached: true, ...options });
  children.push({ name, child });
  child.on("exit", (code, signal) => {
    if (stopping) return;
    failure = `${name} exited (${code ?? signal})`;
    shutdown(failure);
  });
  return child;
}

// A session that stops before the emulators finish importing has nothing to
// save, and asking for one turns a busy port into a misleading export error.
function exportSnapshot() {
  if (!emulatorsReady) {
    console.log("[local-dev] the emulators never became ready; no snapshot taken");
    return;
  }
  try {
    execFileSync(
      "npx",
      ["firebase", "emulators:export", DATA, "--force", "--project", PROJECT],
      { stdio: "ignore" }
    );
    console.log(`[local-dev] emulator data saved to ${DATA}/`);
  } catch (err) {
    console.error(`[local-dev] snapshot skipped: ${err?.message ?? "emulator unreachable"}`);
  }
}

// Every child leads its own process group, so a negative pid reaches the whole
// tree (npm → vite, npx → firebase → java) and the terminal's interrupt reaches
// only this process.
function signalChild(entry, signal) {
  const { child } = entry;
  if (!child.pid || !running(entry)) return;
  try {
    process.kill(-child.pid, signal);
  } catch (err) {
    console.error(`[local-dev] could not signal pid ${child.pid}: ${err?.message ?? err}`);
  }
}

function shutdown(reason) {
  if (stopping) return;
  stopping = true;
  clearInterval(timer);
  clearTimeout(readyPoll);
  console.log(
    `[local-dev] ${reason}; stopping${emulatorsReady ? " after saving the emulator data" : ""}`
  );
  exportSnapshot();

  const pending = children.filter(running);
  for (const entry of children) signalChild(entry, "SIGTERM");

  const hardStop = setTimeout(() => {
    for (const entry of children) signalChild(entry, "SIGKILL");
  }, STOP_GRACE_MS);
  const giveUp = setTimeout(() => process.exit(stopCode()), EXIT_DEADLINE_MS);

  Promise.all(
    pending.map(
      ({ child }) =>
        new Promise((resolve) => {
          if (child.exitCode !== null || child.signalCode !== null) resolve();
          else child.once("exit", resolve);
        })
    )
  ).then(() => {
    clearTimeout(hardStop);
    clearTimeout(giveUp);
    process.exit(stopCode());
  });
}

async function preflight() {
  const busy = [];
  for (const entry of LOCAL_PORTS) {
    if (!(await listening(entry.port))) continue;
    busy.push(busyMessage(entry, owners(entry.port)[0]));
  }
  if (!busy.length) return;
  for (const line of busy) console.error(`[local-dev] ${line}`);
  console.error("[local-dev] run `make clean` to save the last session and reclaim its ports");
  process.exit(1);
}

function watchEmulators() {
  const tick = async () => {
    if (stopping || emulatorsReady) return;
    if ((await Promise.all(EMULATOR_PORTS.map(listening))).every(Boolean)) {
      emulatorsReady = true;
      console.log(`[local-dev] emulators ready; saving every ${SAVE_MINUTES} min and on Ctrl+C`);
      return;
    }
    readyPoll = setTimeout(tick, READY_POLL_MS);
  };
  readyPoll = setTimeout(tick, READY_POLL_MS);
}

await preflight();

const imported = existsSync(METADATA);
console.log(
  imported
    ? `[local-dev] importing ${DATA}/`
    : `[local-dev] ${DATA}/ holds no snapshot; starting empty`
);
console.log("[local-dev] app: http://localhost:5173");

start("vite", "npm", ["run", "dev"], { cwd: "frontend" });
start(
  "firebase",
  "npx",
  [
    "firebase",
    "emulators:start",
    "--project",
    PROJECT,
    ...(imported ? [`--import=${DATA}`] : []),
  ],
  {}
);
// Watch the artifact too: the backend caches it per process, so an edit under
// data/ would otherwise leave a running server validating against the old graph.
start("uvicorn", "uv", ["run", "uvicorn", "app.main:app", "--reload", "--reload-dir", "app", "--reload-dir", "../data", "--port", "8000"], {
  cwd: "backend",
  env: {
    ...process.env,
    FIREBASE_PROJECT_ID: PROJECT,
    FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
    FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
    ALLOWED_EMAILS: "dev@localhost",
  },
});

timer = setInterval(exportSnapshot, Math.max(1, SAVE_MINUTES) * 60_000);
timer.unref();

watchEmulators();

process.on("SIGINT", () => shutdown("interrupted"));
process.on("SIGTERM", () => shutdown("terminated"));
