import test from "node:test";
import assert from "node:assert/strict";

import { setupFieldActions } from "../../frontend/src/store/setupFields.js";

const actions = setupFieldActions();

function store(overrides = {}) {
  const calls = [];
  return {
    calls,
    state: {
      mode: "scratch",
      busy: false,
      name: "House Pale",
      styleId: "style-1",
      equipmentId: "rig-1",
      fermenterId: "fermenter-1",
      waterId: "water-1",
      file: null,
      filename: "",
      ...overrides,
    },
    closeModal: () => calls.push("close"),
    create: () => calls.push("create"),
    startImport: () => calls.push("import"),
    primaryLabel: () => "Reading document",
    canCreate: () => true,
    canStartImport: () => false,
    chooseFile: (file) => calls.push(["file", file]),
    styleOptions: () => [{ value: "style-1", label: "Pale Ale" }],
    equipmentOptions: () => [{ value: "rig-1", label: "Rig" }],
    fermenterOptions: () => [{ value: "fermenter-1", label: "Fermenter" }],
    waterOptions: () => [{ value: "water-1", label: "Water" }],
  };
}

test("the new-batch shell saves through create in scratch mode", () => {
  const context = store();
  const config = actions.newBatchConfig.call(context);

  assert.equal(config.id, "new-batch");
  assert.equal(config.saveLabel(), "Create batch");
  assert.equal(config.saveDisabled(), false);
  config.save();
  assert.deepEqual(context.calls, ["create"]);
});

test("the new-batch shell saves through the importer in recipe mode", () => {
  const context = store({ mode: "recipe" });
  const config = actions.newBatchConfig.call(context);

  assert.equal(config.saveLabel(), "Reading document");
  assert.equal(config.saveDisabled(), true);
  config.save();
  assert.deepEqual(context.calls, ["import"]);
});

test("a busy setup disables both cancel and save", () => {
  const context = store({ busy: true });
  const config = actions.newBatchConfig.call(context);

  assert.equal(config.cancelDisabled(), true);
  assert.equal(config.saveDisabled(), true);
});

test("the recipe file field only shows in recipe mode and forwards the file", () => {
  const context = store();
  const [field] = actions.recipeFileFields.call(context);

  assert.equal(field.id, "recipe-file");
  assert.equal(field.when(), false);
  context.state.mode = "recipe";
  assert.equal(field.when(), true);
  field.write("pdf");
  assert.deepEqual(context.calls, [["file", "pdf"]]);
  assert.equal(field.attrs.accept, "application/pdf");
});

test("the identity quartet binds each select to its own state key and options", () => {
  const context = store();
  const fields = actions.batchIdentityFields.call(context);

  assert.deepEqual(
    fields.map((field) => field.id),
    ["batch-name", "batch-style", "batch-rig", "batch-fermenter", "batch-water"]
  );
  assert.equal(fields[0].when(), true);
  assert.equal(fields[0].read(), "House Pale");
  assert.deepEqual(fields[1].options(), [{ value: "style-1", label: "Pale Ale" }]);
  assert.equal(fields[4].read(), "water-1");

  fields[1].write("style-2");
  assert.equal(context.state.styleId, "style-2");
});
