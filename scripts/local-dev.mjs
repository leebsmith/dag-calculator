// Local dev supervisor: starts Vite, the Firebase emulators and Uvicorn, and
// snapshots the emulators every few minutes and on the way down.
//
// A terminal Ctrl+C signals the whole foreground process group, which kills the
// Firestore emulator before its own --export-on-exit can run. This process
// starts the emulators in their own process group, so the interrupt arrives
// here only, exports while they are still alive, and only then stops them.

import { execFileSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { clearInterval, setInterval } from "node:timers";

const PROJECT = process.env.FIREBASE_PROJECT_ID ?? "dag-calculator";
const DATA = "emulator-data";
const METADATA = `${DATA}/firebase-export-metadata.json`;
const SAVE_MINUTES = Number(process.env.SAVE_INTERVAL_MINUTES ?? 5);

const children = [];
let stopping = false;
let timer = null;

function start(name, command, args, options = {}) {
  const child = spawn(command, args, { stdio: "inherit", detached: true, ...options });
  children.push({ name, child });
  child.on("exit", (code) => {
    if (stopping) return;
    shutdown(`${name} exited (${code ?? "signal"})`);
  });
  return child;
}

function exportSnapshot() {
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
function signalChild({ child }, signal) {
  if (!child.pid || child.exitCode !== null) return;
  try {
    process.kill(-child.pid, signal);
  } catch (err) {
    console.error(`[local-dev] could not signal pid ${child.pid}: ${err?.message ?? err}`);
  }
}

function shutdown(reason) {
  if (stopping) return;
  stopping = true;
  if (timer) clearInterval(timer);
  console.log(`[local-dev] ${reason}; saving emulator data before shutdown`);
  exportSnapshot();

  const pending = children.filter(({ child }) => child.exitCode === null);
  for (const entry of children) signalChild(entry, "SIGTERM");

  const hardStop = setTimeout(() => {
    for (const entry of children) signalChild(entry, "SIGKILL");
  }, 5000);

  Promise.all(
    pending.map(
      ({ child }) =>
        new Promise((resolve) => {
          if (child.exitCode !== null) resolve();
          else child.once("exit", resolve);
        })
    )
  ).then(() => {
    clearTimeout(hardStop);
    process.exit(0);
  });
}

const imported = existsSync(METADATA);
console.log(
  imported
    ? `[local-dev] importing ${DATA}/; saving every ${SAVE_MINUTES} min and on Ctrl+C`
    : `[local-dev] ${DATA}/ holds no snapshot; starting empty and saving every ${SAVE_MINUTES} min`
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
start("uvicorn", "uv", ["run", "uvicorn", "app.main:app", "--reload", "--port", "8000"], {
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

process.on("SIGINT", () => shutdown("interrupted"));
process.on("SIGTERM", () => shutdown("terminated"));
