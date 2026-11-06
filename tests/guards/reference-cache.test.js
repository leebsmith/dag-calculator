// The single-cache contract: the entry points own one reference cache and one
// library, and a caller that supplies the pair must supply both. The fallbacks
// remain for bare standalone tests.

import test from "node:test";
import assert from "node:assert/strict";

import { createStepApp } from "../../frontend/src/adapters/stepAdapter.js";
import { createSetupStore } from "../../frontend/src/store/setup.js";
import {
  assertReferencePair,
  createReferenceCache,
} from "../../frontend/src/store/referenceCache.js";
import { createLibrary } from "../../frontend/src/store/library.js";
import { read } from "./util.js";

const ENTRY_POINTS = [
  "frontend/src/adapters/stepAdapter.js",
  "frontend/src/store/setup.js",
];

test("the pairing guard rejects exactly one of cache/library", () => {
  assert.throws(() => assertReferencePair({ cache: {} }, true), /arrive together/);
  assert.throws(() => assertReferencePair({ library: {} }, true), /arrive together/);
  assert.throws(() => assertReferencePair({ cache: null, library: {} }, true), /arrive together/);
  assert.doesNotThrow(() => assertReferencePair({ cache: {}, library: {} }, true));
  assert.doesNotThrow(() => assertReferencePair({}, true));
  assert.doesNotThrow(() => assertReferencePair({ cache: {} }), "node is not a DEV build");
});

test("both entry points run the pairing guard", () => {
  const calls = {
    "frontend/src/adapters/stepAdapter.js": /assertReferencePair\(options\);/,
    "frontend/src/store/setup.js": /assertReferencePair\(\{ cache, library \}\);/,
  };
  for (const file of ENTRY_POINTS) {
    assert.match(read(file), calls[file], `${file} must run the pairing guard`);
  }
});

test("a production-shaped call uses the injected pair", () => {
  const cache = createReferenceCache();
  const sync = cache.syncLibraryItems.bind(cache);
  let syncs = 0;
  cache.syncLibraryItems = (items) => {
    syncs += 1;
    return sync(items);
  };
  const library = createLibrary();

  const app = createStepApp({ cache, library });
  const setup = createSetupStore({ cache, library });

  assert.equal(app.library, library, "the step app keeps the injected library");
  assert.equal(setup.library, library, "the setup store keeps the injected library");
  assert.equal(syncs, 1, "the step app syncs the injected cache, not a fallback");
  assert.equal(setup.references(), cache.references, "the setup store reads the injected cache");
});

test("a bare call still creates a private pair", () => {
  const app = createStepApp();
  const setup = createSetupStore({});

  assert.ok(app.library && typeof app.library.items === "function");
  assert.ok(setup.library && typeof setup.library.items === "function");
  assert.notEqual(app.library, setup.library, "bare calls do not share a library");
});
