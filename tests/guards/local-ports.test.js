// The port table is the one place that knows which sockets a local run owns: the
// preflight and the reclaim script both read it, and a stale session is only
// cleared if the table still names the port it holds. A new emulator therefore
// belongs here, not only in firebase.json.

import test from "node:test";
import assert from "node:assert/strict";

import {
  LOCAL_PORTS,
  busyMessage,
  ownersFromLsof,
  ownersFromSs,
} from "../../scripts/local-ports.mjs";
import { read } from "./util.js";

const declared = () => {
  const config = JSON.parse(read("firebase.json"));
  return Object.entries(config.emulators)
    .filter(([, emulator]) => typeof emulator?.port === "number")
    .map(([name, emulator]) => ({ name, port: emulator.port }));
};

test("every emulator port firebase.json declares is a port the tools reclaim", () => {
  const ports = new Map(LOCAL_PORTS.map((entry) => [entry.port, entry.what]));
  for (const { name, port } of declared()) {
    assert.ok(ports.has(port), `${name} binds ${port}, but scripts/local-ports.mjs does not list it`);
  }
});

test("no port is listed twice", () => {
  const ports = LOCAL_PORTS.map(({ port }) => port);
  assert.equal(new Set(ports).size, ports.length, "a duplicate port hides which service owns it");
});

test("ss is read for the process behind the socket, not the command line", () => {
  const output = [
    "LISTEN 0 511 127.0.0.1:8000 0.0.0.0:*",
    'LISTEN 0 511 127.0.0.1:8000 0.0.0.0:* users:(("python",pid=129869,fd=3),("uvicorn",pid=129869,fd=4))',
    'LISTEN 0 511 [::1]:8000 [::]:* users:(("python",pid=129869,fd=5))',
    'LISTEN 0 511 127.0.0.1:8080 0.0.0.0:* users:(("java",pid=999,fd=9))',
  ].join("\n");
  assert.deepEqual(ownersFromSs(output, 8000), [{ pid: 129869, command: "python" }]);
});

test("lsof's field output pairs each command with its pid", () => {
  assert.deepEqual(ownersFromLsof("p129869\ncpython\np129900\ncnode\n"), [
    { pid: 129869, command: "python" },
    { pid: 129900, command: "node" },
  ]);
});

test("a busy port names the process that holds it", () => {
  assert.equal(
    busyMessage({ port: 8000, what: "backend" }, { pid: 129869, command: "python" }),
    "port 8000 (backend) is held by pid 129869 (python)"
  );
  assert.equal(
    busyMessage({ port: 8000, what: "backend" }, undefined),
    "port 8000 (backend) is held by an unidentified process"
  );
});
