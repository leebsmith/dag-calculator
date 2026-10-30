// Reclaim the ports a local run owns, by port rather than by command line, as
// the backstop for a session whose supervisor died and left its children
// detached. `make clean` runs this after it has given a live supervisor the
// chance to stop and save on the way down.
//
// A refused SIGTERM is escalated: a uvicorn reloader can outlive the worker it
// forked, wedged on a zombie and still holding the listening socket, so a TERM
// that does not free the port within the grace period becomes a KILL.

import { LOCAL_PORTS, busyMessage, listening, owners } from "./local-ports.mjs";

const TERM_GRACE_MS = 3000;
const KILL_GRACE_MS = 1000;
const POLL_MS = 200;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function signalOwners(port, signal) {
  const pids = owners(port).map(({ pid }) => pid);
  for (const pid of pids) {
    try {
      process.kill(pid, signal);
    } catch {
      // It exited between the scan and the signal.
    }
  }
  return pids;
}

async function freeWithin(port, grace) {
  const deadline = Date.now() + grace;
  while (Date.now() < deadline) {
    if (!(await listening(port))) return true;
    await sleep(POLL_MS);
  }
  return !(await listening(port));
}

async function reclaim(entry) {
  if (!(await listening(entry.port))) return null;
  const pids = signalOwners(entry.port, "SIGTERM");
  if (!(await freeWithin(entry.port, TERM_GRACE_MS))) signalOwners(entry.port, "SIGKILL");
  if (!(await freeWithin(entry.port, KILL_GRACE_MS))) return busyMessage(entry, owners(entry.port)[0]);
  console.log(`clean: reclaimed port ${entry.port} (${entry.what}) from ${pidList(pids)}`);
  return null;
}

function pidList(pids) {
  return pids.length ? `pid ${pids.join(", ")}` : "a process that has since exited";
}

const stuck = [];
for (const entry of LOCAL_PORTS) {
  const failure = await reclaim(entry);
  if (failure) stuck.push(failure);
}

if (stuck.length) {
  for (const line of stuck) console.error(`clean: ${line}`);
  console.error("clean: free them by hand; make local-dev refuses to start while they are held");
  process.exit(1);
}

console.log("clean: every local port is free");
