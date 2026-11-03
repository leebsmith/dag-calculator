// Browser-proxy harness for suites that must exercise Alpine's reactive wrapper.
//
// `main.js` hands the adapter's app to `Alpine.reactive`; the raw-app suites
// never do, so a proxy-hostile property can pass every test and still throw in
// the browser (a locked-down symbol whose value is an object is the canonical
// example). This helper reproduces the wrapper in Node.
//
// Alpine's module touches the DOM at import and its CommonJS build exports
// `{ Alpine }`, so: install a minimal shim, resolve the package from the
// frontend workspace, then import it dynamically.

import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const FRONTEND = new URL("../../frontend/", import.meta.url);

let Alpine = null;

class ElementStub {
  constructor() {
    this.style = {};
  }

  setAttribute() {}

  addEventListener() {}

  getAttribute() {
    return null;
  }
}

class MutationObserverStub {
  observe() {}

  disconnect() {}

  takeRecords() {
    return [];
  }
}

function shimDom() {
  if (globalThis.document) return;
  globalThis.MutationObserver = MutationObserverStub;
  globalThis.Element = ElementStub;
  globalThis.HTMLElement = ElementStub;
  globalThis.Node = ElementStub;
  globalThis.SVGElement = ElementStub;
  globalThis.window = globalThis;
  globalThis.document = {
    createElement: () => new ElementStub(),
    createTreeWalker: () => ({}),
    querySelectorAll: () => [],
    addEventListener() {},
    body: new ElementStub(),
    documentElement: new ElementStub(),
  };
}

async function loadAlpine() {
  if (Alpine) return Alpine;
  shimDom();
  const require = createRequire(import.meta.url);
  const entry = require.resolve("alpinejs", { paths: [FRONTEND.pathname] });
  const module = await import(pathToFileURL(entry).href);
  Alpine = module.Alpine;
  return Alpine;
}

// Wrap an app exactly as `main.js` does, so `this` in every handler and getter
// is the reactive proxy the browser uses.
export async function alpineReactive(app) {
  const alpine = await loadAlpine();
  return alpine.reactive(app);
}
