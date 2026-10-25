// Boundary wiring: every artifact boundary must have a frontend builder, URL,
// and offline stub, and the URL map must match the shared route fixture. The
// Python side pins the same fixture to the FastAPI routes.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { BOUNDARY_BUILDERS } from "../../frontend/src/adapters/boundaryRequest.js";
import { BOUNDARY_URLS } from "../../frontend/src/adapters/boundaryRunner.js";
import { STUB_BOUNDARIES } from "../../frontend/src/adapters/stubBoundaries.js";
import { artifact } from "./util.js";

const ROUTES = JSON.parse(
  readFileSync(new URL("../conformance/fixtures/boundary-routes.json", import.meta.url), "utf8")
);

test("every artifact boundary is wired for builder, URL, and offline stub", () => {
  const bindings = Object.values(artifact().nodes)
    .filter((node) => node.kind === "boundary")
    .map((node) => node.binding);

  for (const binding of bindings) {
    assert.equal(
      typeof BOUNDARY_BUILDERS[binding],
      "function",
      `${binding} has no request builder`
    );
    assert.equal(typeof BOUNDARY_URLS[binding], "string", `${binding} has no URL`);
    assert.equal(typeof STUB_BOUNDARIES[binding], "function", `${binding} has no offline stub`);
    assert.ok(ROUTES[binding], `${binding} is missing from the route fixture`);
    assert.equal(BOUNDARY_URLS[binding], ROUTES[binding].path, `${binding} URL drift`);
    assert.match(BOUNDARY_URLS[binding], /^\/solve\//, `${binding} URL must be /solve/*`);
  }

  assert.deepEqual(
    bindings.sort(),
    Object.keys(ROUTES).sort(),
    "artifact boundaries and route fixture bindings diverge"
  );
});
