import test from "node:test";
import assert from "node:assert/strict";

import { waterPlanFieldsActions } from "../../frontend/src/adapters/cards/waterCardActions.js";

function app() {
  const field = (id, label, display) => ({
    id,
    label,
    unit: "ppm",
    display,
    hint: `${label} hint`,
    validation: { holds: true },
  });
  return {
    waterPlan: {
      target: { id: "", label: "", hint: "target hint" },
      floor: field("floor-id", "Calcium floor", "50"),
      ceiling: field("ceiling-id", "Calcium ceiling", "150"),
      mashPh: field("ph-id", "Mash pH", "5.4"),
      floorNotice: "floor notice",
      provenance: {
        floor: { showSeed: true, seedTitle: "floor seed", showReset: true, resetTitle: "floor reset" },
        ceiling: { showSeed: false, seedTitle: "", showReset: false, resetTitle: "" },
        mashPh: { showSeed: false, seedTitle: "", showReset: true, resetTitle: "ph reset" },
      },
    },
    waterTargetOptions: [{ value: "freeform", label: "Freeform" }],
    waterTargetSelection: "freeform",
    selectWaterTarget() {},
    inputDraft: (_key, value) => value,
    inputKey: (scope, id) => `${scope}:${id}`,
    editWaterNumber() {},
    commitWaterNumber() {},
    resetWaterField() {},
  };
}

test("the water plan schema keeps four fields with their fallback ids", () => {
  const fields = waterPlanFieldsActions().waterPlanFields.call(app());

  assert.equal(fields.length, 4);
  assert.deepEqual(
    fields.map((field) => field.id),
    ["water-target-profile", "floor-id", "ceiling-id", "ph-id"]
  );
  assert.equal(fields[0].type, "select");
  assert.equal(fields[0].label(), "Targets");
  assert.deepEqual(fields[0].options(), [{ value: "freeform", label: "Freeform" }]);
});

test("the number fields share the label, badge, reset and validation shape", () => {
  const fields = waterPlanFieldsActions().waterPlanFields.call(app());
  const floor = fields[1];

  assert.equal(floor.type, "number");
  assert.equal(floor.label(), "Calcium floor (ppm)");
  assert.equal(floor.read(), "50");
  assert.equal(floor.step, 1);
  assert.deepEqual(floor.badge(), { text: "seed", title: "floor seed" });
  assert.equal(floor.reset().show, true);
  assert.equal(floor.reset().title, "floor reset");
  assert.deepEqual(floor.hints, [
    {
      text: "Outside the allowed range",
      class: "text-danger",
      when: floor.hints[0].when,
    },
  ]);
  assert.equal(floor.hints[0].when(), false);
});

test("the range hint fires only when the field reports holds === false", () => {
  const context = app();
  context.waterPlan.floor.validation = { holds: false };
  const fields = waterPlanFieldsActions().waterPlanFields.call(context);

  assert.equal(fields[1].hints[0].when(), true);
});

test("floor and ceiling hints prefer the shared floor notice; mash pH does not", () => {
  const fields = waterPlanFieldsActions().waterPlanFields.call(app());

  assert.equal(fields[1].hint(), "floor notice");
  assert.equal(fields[2].hint(), "floor notice");
  assert.equal(fields[3].hint(), "Mash pH hint");
});

test("the draft seam is keyed per field", () => {
  const fields = waterPlanFieldsActions().waterPlanFields.call(app());

  assert.equal(fields[2].draft.read(), "150");
});
