import test from "node:test";
import assert from "node:assert/strict";

import { formBuilder } from "../../frontend/src/components/formBuilder.js";
import { resolveConfigFromElement, resolveNamedMember } from "../../frontend/src/components/configAttributes.js";

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
