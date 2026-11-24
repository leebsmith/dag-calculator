import test from "node:test";
import assert from "node:assert/strict";

import { formBuilder } from "../../frontend/src/components/formBuilder.js";
import {
  resolveConfigFromElement,
  resolveNamedMember,
  resolveReference,
} from "../../frontend/src/components/configAttributes.js";
import { scopeAlias } from "../../frontend/src/components/scopeAlias.js";

function withScope(scope, run) {
  const previous = globalThis.Alpine;
  globalThis.Alpine = { $data: () => scope };
  try {
    return run();
  } finally {
    globalThis.Alpine = previous;
  }
}

function element(name) {
  return { dataset: { schema: name }, parentElement: {} };
}

test("a dotted name resolves through the scope and calls with its owner", () => {
  const store = {
    calls: [],
    batchIdentityFields() {
      this.calls.push("store");
      return { schema: [] };
    },
  };
  const scope = { $store: { setup: store } };

  assert.deepEqual(resolveNamedMember(scope, "$store.setup.batchIdentityFields"), { schema: [] });
  assert.deepEqual(store.calls, ["store"]);
});

test("a plain name calls the scope member; a missing member yields null", () => {
  const scope = { hopInspectorFields: () => ({ schema: [{ id: "x" }] }) };

  assert.deepEqual(resolveNamedMember(scope, "hopInspectorFields").schema[0], { id: "x" });
  assert.equal(resolveNamedMember(scope, "missing"), null);
  assert.equal(resolveNamedMember(scope, ""), null);
});

test("the element resolver reads the named member from the parent scope", () => {
  const scope = { discussionFields: () => [{ id: "discussion" }] };
  const result = withScope(scope, () => resolveConfigFromElement(element("discussionFields"), "schema"));

  assert.deepEqual(result, [{ id: "discussion" }]);
  assert.equal(resolveConfigFromElement({ dataset: {}, parentElement: {} }, "schema"), null);
});

test("a declared attribute without a published Alpine handle fails loudly", () => {
  const previous = globalThis.Alpine;
  globalThis.Alpine = undefined;
  try {
    assert.throws(
      () => resolveConfigFromElement(element("discussionFields"), "schema"),
      /Alpine is not published/
    );
    assert.equal(resolveConfigFromElement({ dataset: {}, parentElement: {} }, "schema"), null);
  } finally {
    globalThis.Alpine = previous;
  }
});

test("formBuilder takes an array schema from the data attribute", () => {
  const scope = {
    discussionFields: () => [{ id: "discussion", type: "text", label: "Discussion", modelKey: "x" }],
  };
  const component = formBuilder();

  withScope(scope, () => {
    component.$el = element("discussionFields");
    component.init();
  });

  assert.equal(component.schema.length, 1);
  assert.equal(component.fields.length, 1);
  assert.equal(component.fields[0].label, "Discussion");
});

test("formBuilder takes schema and onChange from an object member", () => {
  const onChange = () => {};
  const scope = {
    maltRowNameField: () => ({
      schema: [{ id: "malt-row-name", type: "text", label: "Malt name", modelKey: "name" }],
      onChange,
    }),
  };
  const component = formBuilder();

  withScope(scope, () => {
    component.$el = element("maltRowNameField");
    component.init();
  });

  assert.equal(component.schema[0].id, "malt-row-name");
  assert.equal(component.onChange, onChange);
});

test("an explicit call still wins over the attribute", () => {
  const component = formBuilder({ schema: [{ id: "explicit", type: "text", label: "X" }] });

  assert.equal(component.schema[0].id, "explicit");
  assert.equal(component.onChange, null);
});

test("resolveReference returns the owner and the uncalled member", () => {
  const store = { originOf: (id) => ({ title: id }) };
  const scope = { $store: { imports: store } };

  const reference = resolveReference(scope, "$store.imports.originOf");
  assert.equal(reference.owner, store);
  assert.equal(reference.value.call(reference.owner, "b1").title, "b1");
  assert.equal(resolveReference(scope, "$store.imports.missing"), null);
});

function withAlias(dataset, scope, run) {
  return withScope(scope, () => {
    const component = scopeAlias();
    component.$el = { dataset, parentElement: {} };
    component.init();
    return run(component);
  });
}

test("scopeAlias resolves a call with an argument from the parent scope", () => {
  const store = { originOf: (id) => ({ title: `origin ${id}` }) };
  const scope = { $store: { imports: store, recipes: { activeId: "b7" } } };
  withAlias(
    { origin: "$store.imports.originOf", originArg: "$store.recipes.activeId" },
    scope,
    (component) => {
      assert.deepEqual(component.origin, { title: "origin b7" });
    }
  );
});

test("scopeAlias resolves a nested path and defaults findings to an array", () => {
  const scope = { origin: { delta: { rows: 3 } }, stepFindingItems: [{ id: "f1" }] };
  withAlias({ delta: "origin.delta" }, scope, (component) => {
    assert.deepEqual(component.delta, { rows: 3 });
  });
  withAlias({ findings: "stepFindingItems" }, scope, (component) => {
    assert.deepEqual(component.findings, [{ id: "f1" }]);
  });
  withAlias({ findings: "nope" }, scope, (component) => {
    assert.deepEqual(component.findings, []);
  });
});

test("scopeAlias without a source never needs the Alpine handle", () => {
  const previous = globalThis.Alpine;
  globalThis.Alpine = undefined;
  try {
    const component = scopeAlias();
    component.$el = { dataset: {}, parentElement: {} };
    component.init();
    assert.equal(component.origin, null);
    assert.deepEqual(component.findings, []);
  } finally {
    globalThis.Alpine = previous;
  }
});

// `editor.html` binds `data-findings="findings"`, the same name as the getter
// this component publishes. Resolving through the element's own scope found that
// getter and recursed until the stack overflowed.
test("scopeAlias resolves its sources through the enclosing scope", () => {
  const parent = { marker: "parent scope" };
  const own = { marker: "own binding" };
  const aliasElement = { dataset: { findings: "marker" }, parentElement: parent };
  const previous = globalThis.Alpine;
  globalThis.Alpine = { $data: (target) => (target === parent ? parent : own) };
  try {
    const component = scopeAlias();
    component.$el = aliasElement;
    component.init();
    assert.equal(component.findings, "parent scope");
  } finally {
    globalThis.Alpine = previous;
  }
});
