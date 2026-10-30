// The ports a local run owns, whether each one is listening, and which process
// holds it. `local-dev.mjs` preflights with these before it spawns anything and
// `reclaim-ports.mjs` reclaims with them.
//
// Ports rather than command lines, because a process is not the socket: uvicorn's
// reloader forks the worker that binds 8000, and that worker's command line no
// longer names uvicorn, so a `pkill -f` sweep reports success while the port
// stays held.

import { execFileSync } from "node:child_process";
import { connect } from "node:net";

export const LOCAL_PORTS = [
  { port: 4000, what: "emulator UI" },
  { port: 4400, what: "emulator hub" },
  { port: 4500, what: "emulator logging" },
  { port: 5000, what: "emulator hosting" },
  { port: 5173, what: "vite" },
  { port: 8000, what: "backend" },
  { port: 8080, what: "firestore emulator" },
  { port: 9099, what: "auth emulator" },
];

const PROBE_TIMEOUT_MS = 250;
const NOBODY = "an unidentified process";

function connects(host, port) {
  return new Promise((resolve) => {
    const socket = connect({ host, port });
    const settle = (value) => {
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(PROBE_TIMEOUT_MS, () => settle(false));
    socket.once("connect", () => settle(true));
    socket.once("error", () => settle(false));
  });
}

export async function listening(port) {
  if (await connects("127.0.0.1", port)) return true;
  return connects("::1", port);
}

function unique(entries) {
  const seen = new Map();
  for (const entry of entries) seen.set(entry.pid, entry);
  return [...seen.values()];
}

export function ownersFromSs(output, port) {
  const found = [];
  for (const line of output.split("\n")) {
    const fields = line.trim().split(/\s+/);
    if (!fields.some((field) => field.endsWith(`:${port}`))) continue;
    for (const [, command, pid] of line.matchAll(/"([^"]+)",pid=(\d+)/g)) {
      found.push({ pid: Number(pid), command });
    }
  }
  return unique(found);
}

export function ownersFromLsof(output) {
  const found = [];
  let current = null;
  for (const line of output.split("\n")) {
    if (line.startsWith("p")) {
      if (current) found.push(current);
      current = { pid: Number(line.slice(1)), command: NOBODY };
    } else if (line.startsWith("c") && current) {
      current.command = line.slice(1);
    }
  }
  if (current) found.push(current);
  return unique(found);
}

function run(command, args) {
  return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}

export function owners(port) {
  try {
    const fromSs = ownersFromSs(run("ss", ["-Hltnp"]), port);
    if (fromSs.length) return fromSs;
  } catch {
    // `ss` is Linux-only; the lsof pass below is the fallback.
  }
  try {
    return ownersFromLsof(run("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-Fpc"]));
  } catch {
    return [];
  }
}

export function busyMessage({ port, what }, holder) {
  const who = holder ? `pid ${holder.pid} (${holder.command})` : NOBODY;
  return `port ${port} (${what}) is held by ${who}`;
}
